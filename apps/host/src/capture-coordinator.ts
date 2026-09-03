import os from "node:os";
import path from "node:path";
import { access } from "node:fs/promises";
import type { CaptureCommitResult, JourneyArchive, SourceBundleFile } from "@agentjourney/archive";
import type { PendingEvidenceDocument } from "@agentjourney/contracts";
import type { DiscoveredJourney, SourceAdapterPlugin } from "@agentjourney/plugin-sdk";
import { CapturedBundle, FilesystemSource } from "./filesystem-source.js";
import type { SettingsStore } from "./settings.js";
import type { EventHub } from "./event-hub.js";

export interface SourceStatus {
  sourceAgent: string;
  displayName: string;
  adapterId: string;
  adapterVersion: string;
  suggestedRoot: string;
  available: boolean;
  approved: boolean;
  approvedRoot?: string;
  scanPolicy: "manual" | "automatic";
}

export interface CaptureOutcome {
  results: CaptureCommitResult[];
  pending: PendingEvidenceDocument[];
  skippedExcluded: number;
}

export class CaptureCoordinator {
  private readonly adaptersByAgent: Map<string, SourceAdapterPlugin>;
  private readonly activeCaptures = new Map<string, Promise<CaptureOutcome>>();

  constructor(
    adapters: readonly SourceAdapterPlugin[],
    private readonly archive: JourneyArchive,
    private readonly settings: SettingsStore,
    private readonly events: EventHub
  ) {
    this.adaptersByAgent = new Map(adapters.map((adapter) => [adapter.manifest.sourceAgent, adapter]));
  }

  async listSources(): Promise<SourceStatus[]> {
    return Promise.all(
      [...this.adaptersByAgent.values()].map(async (adapter) => {
        const suggestedRoot = this.suggestedRoot(adapter);
        const approved = this.settings.rootFor(adapter.manifest.sourceAgent);
        return {
          sourceAgent: adapter.manifest.sourceAgent,
          displayName: adapter.manifest.displayName,
          adapterId: adapter.manifest.id,
          adapterVersion: adapter.manifest.version,
          suggestedRoot,
          available: await this.pathExists(approved?.root ?? suggestedRoot),
          approved: Boolean(approved),
          ...(approved ? { approvedRoot: approved.root, scanPolicy: approved.scanPolicy } : { scanPolicy: "manual" as const })
        };
      })
    );
  }

  async discover(sourceAgent: string): Promise<DiscoveredJourney[]> {
    const { adapter, source } = await this.openApproved(sourceAgent);
    const candidates = await adapter.discover(source);
    const entries = new Map((await source.list()).map((entry) => [entry.path.replaceAll("\\", "/"), entry]));
    const enriched = candidates.map((candidate) => {
      const candidateEntries = candidate.relativePaths.flatMap((filePath) => {
        const entry = entries.get(filePath.replaceAll("\\", "/"));
        return entry ? [entry] : [];
      });
      const lastModifiedAt = candidateEntries
        .flatMap(({ modifiedAt }) => modifiedAt && !Number.isNaN(Date.parse(modifiedAt)) ? [modifiedAt] : [])
        .sort((left, right) => Date.parse(left) - Date.parse(right))
        .at(-1);
      return {
        ...candidate,
        byteSize: candidateEntries.reduce((total, entry) => total + entry.size, 0),
        ...(lastModifiedAt ? { lastModifiedAt } : {})
      };
    });
    const exclusions = await this.archive.listCaptureExclusions();
    const excluded = new Set(
      exclusions
        .filter((item) => item.sourceAgent === sourceAgent)
        .map((item) => item.nativeSessionId)
    );
    return enriched.filter(({ nativeSessionId }) => !excluded.has(nativeSessionId));
  }

  capture(sourceAgent: string, selectedNativeIds?: readonly string[]): Promise<CaptureOutcome> {
    const inProgress = this.activeCaptures.get(sourceAgent);
    if (inProgress) return inProgress;
    const operation = this.captureOnce(sourceAgent, selectedNativeIds).finally(() => {
      this.activeCaptures.delete(sourceAgent);
    });
    this.activeCaptures.set(sourceAgent, operation);
    return operation;
  }

  async importSourceBundle(sourceAgent: string, files: readonly SourceBundleFile[]): Promise<CaptureOutcome> {
    const adapter = this.adaptersByAgent.get(sourceAgent);
    if (!adapter) throw new Error(`Unknown Source Agent: ${sourceAgent}`);
    const source = CapturedBundle.fromFiles(files);
    const candidates = await adapter.discover(source);
    if (candidates.length === 0) throw new Error("The selected files contain no discoverable native sessions");
    const results: CaptureCommitResult[] = [];
    const pending: PendingEvidenceDocument[] = [];
    for (const candidate of candidates) {
      const candidateFiles = candidate.relativePaths.map((relativePath) => ({
        relativePath,
        bytes: source.readBytes(relativePath)
      }));
      const bundle = CapturedBundle.fromFiles(candidateFiles);
      try {
        const interpretation = await adapter.interpret(candidate, bundle);
        results.push(await this.archive.commitCapture({
          files: candidateFiles,
          interpretation,
          sourceProvenance: { kind: "manual-import", sourcePaths: candidateFiles.map(({ relativePath }) => relativePath) }
        }));
      } catch (error) {
        pending.push(await this.archive.savePendingEvidence({
          sourceAgent,
          nativeSessionId: candidate.nativeSessionId,
          adapterId: adapter.manifest.id,
          adapterVersion: adapter.manifest.version,
          candidate: candidate as unknown as Record<string, unknown>,
          error: error instanceof Error ? error.message : "interpretation failed",
          files: candidateFiles
        }));
      }
    }
    if (results.length > 0) this.events.publish({ type: "archive-changed", at: new Date().toISOString(), data: {} });
    return { results, pending, skippedExcluded: 0 };
  }

  async reinterpretJourney(journeyId: string, revisionId: string): Promise<CaptureCommitResult> {
    const detail = await this.archive.getJourney(journeyId, { revisionId, redacted: false });
    if (!detail) throw new Error("Journey Revision does not exist");
    const adapter = this.adaptersByAgent.get(detail.summary.sourceAgent);
    if (!adapter) throw new Error(`No adapter installed for ${detail.summary.sourceAgent}`);
    const files: SourceBundleFile[] = [];
    for (const file of detail.sourceFiles) {
      const bytes = await this.archive.readSourceFile(revisionId, file.relativePath, false);
      if (!bytes) throw new Error(`Source Evidence is missing: ${file.relativePath}`);
      files.push({ relativePath: file.relativePath, bytes });
    }
    const bundle = CapturedBundle.fromFiles(files);
    const candidates = await adapter.discover(bundle);
    const candidate = candidates.find(({ nativeSessionId }) => nativeSessionId === detail.summary.nativeSessionId);
    if (!candidate) throw new Error("Installed adapter did not rediscover this native session");
    const interpretation = await adapter.interpret(candidate, bundle);
    const result = await this.archive.commitCapture({
      files,
      interpretation,
      interpretationProvenance: "local",
      sourceProvenance: { kind: "reinterpretation" }
    });
    this.events.publish({ type: "archive-changed", at: new Date().toISOString(), data: { journeyId } });
    return result;
  }

  async retryPending(id: string): Promise<CaptureCommitResult> {
    const pending = await this.archive.getPendingEvidence(id);
    if (!pending) throw new Error("Pending Evidence does not exist");
    const adapter = this.adaptersByAgent.get(pending.summary.sourceAgent);
    if (!adapter) throw new Error(`No adapter installed for ${pending.summary.sourceAgent}`);
    const candidate = pending.candidate as unknown as DiscoveredJourney;
    if (!candidate.nativeSessionId || !Array.isArray(candidate.relativePaths)) {
      throw new Error("Pending Evidence candidate is invalid");
    }
    const bundle = CapturedBundle.fromFiles(pending.files);
    const interpretation = await adapter.interpret(candidate, bundle);
    const result = await this.archive.commitCapture({
      files: pending.files,
      interpretation,
      sourceProvenance: { kind: "pending-retry", pendingEvidenceId: id }
    });
    await this.archive.deletePendingEvidence(id);
    this.events.publish({ type: "archive-changed", at: new Date().toISOString(), data: { journeyId: result.journeyId } });
    return result;
  }

  private async captureOnce(sourceAgent: string, selectedNativeIds?: readonly string[]): Promise<CaptureOutcome> {
    const { adapter, source } = await this.openApproved(sourceAgent);
    const candidates = await adapter.discover(source);
    const selected = selectedNativeIds?.length
      ? candidates.filter(({ nativeSessionId }) => selectedNativeIds.includes(nativeSessionId))
      : candidates;
    const results: CaptureCommitResult[] = [];
    const pending: PendingEvidenceDocument[] = [];
    let skippedExcluded = 0;
    this.events.publish({
      type: "capture-started",
      at: new Date().toISOString(),
      data: { sourceAgent, candidateCount: selected.length }
    });

    for (const [index, candidate] of selected.entries()) {
      if (await this.archive.isCaptureExcluded(sourceAgent, candidate.nativeSessionId)) {
        skippedExcluded += 1;
        continue;
      }
      let bundle: CapturedBundle;
      try {
        bundle = await CapturedBundle.fromSource(source, candidate.relativePaths);
      } catch (error) {
        this.events.publish({
          type: "capture-failed",
          at: new Date().toISOString(),
          data: {
            sourceAgent,
            nativeSessionId: candidate.nativeSessionId,
            message: error instanceof Error ? error.message : "could not preserve Source Bundle"
          }
        });
        continue;
      }

      try {
        const interpretation = await adapter.interpret(candidate, bundle);
        const result = await this.archive.commitCapture({
          files: bundle.paths.map((relativePath) => ({ relativePath, bytes: bundle.readBytes(relativePath) })),
          interpretation,
          sourceProvenance: { kind: "scan", sourceRoot: source.rootId, sourcePaths: [...bundle.paths] }
        });
        results.push(result);
        this.events.publish({
          type: "capture-progress",
          at: new Date().toISOString(),
          data: { sourceAgent, index: index + 1, total: selected.length, journeyId: result.journeyId }
        });
      } catch (error) {
        const summary = await this.archive.savePendingEvidence({
          sourceAgent,
          nativeSessionId: candidate.nativeSessionId,
          adapterId: adapter.manifest.id,
          adapterVersion: adapter.manifest.version,
          candidate: candidate as unknown as Record<string, unknown>,
          error: error instanceof Error ? error.message : "interpretation failed",
          files: bundle.paths.map((relativePath) => ({ relativePath, bytes: bundle.readBytes(relativePath) }))
        });
        pending.push(summary);
        this.events.publish({
          type: "capture-failed",
          at: new Date().toISOString(),
          data: { sourceAgent, nativeSessionId: candidate.nativeSessionId, pendingEvidenceId: summary.id, message: summary.error }
        });
      }
    }

    this.events.publish({
      type: "capture-completed",
      at: new Date().toISOString(),
      data: { sourceAgent, captured: results.length, pending: pending.length, skippedExcluded }
    });
    if (results.length > 0) this.events.publish({ type: "archive-changed", at: new Date().toISOString(), data: {} });
    return { results, pending, skippedExcluded };
  }

  private suggestedRoot(adapter: SourceAdapterPlugin): string {
    const segments = process.platform === "win32"
      ? adapter.manifest.defaultRootSegments.windows
      : adapter.manifest.defaultRootSegments.posix;
    return path.join(os.homedir(), ...segments);
  }

  private async openApproved(sourceAgent: string): Promise<{ adapter: SourceAdapterPlugin; source: FilesystemSource }> {
    const adapter = this.adaptersByAgent.get(sourceAgent);
    if (!adapter) throw new Error(`Unknown Source Agent: ${sourceAgent}`);
    const setting = this.settings.rootFor(sourceAgent);
    if (!setting) throw new Error(`Source Root has not been approved for ${sourceAgent}`);
    return { adapter, source: await FilesystemSource.open(setting.root) };
  }

  private async pathExists(candidate: string): Promise<boolean> {
    try {
      await access(candidate);
      return true;
    } catch {
      return false;
    }
  }
}
