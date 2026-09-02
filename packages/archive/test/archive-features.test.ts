import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { unzipSync, zipSync } from "fflate";
import { piAdapter } from "@agentjourney/builtin-adapters";
import { MemorySource } from "@agentjourney/plugin-sdk/testing";
import { fixturePath } from "@agentjourney/test-fixtures";
import { SqliteJourneyArchive } from "../src/index.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function readTree(root: string): Promise<Record<string, Uint8Array>> {
  const files: Record<string, Uint8Array> = {};
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else files[path.relative(root, absolute).split(path.sep).join("/")] = await readFile(absolute);
    }
  };
  await visit(root);
  return files;
}

async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), "agentjourney-features-"));
  roots.push(root);
  const archive = await SqliteJourneyArchive.open(root);
  const tree = await readTree(fixturePath("pi"));
  const source = new MemorySource(tree);
  const [candidate] = await piAdapter.discover(source);
  const interpretation = await piAdapter.interpret(candidate!, source);
  const files = candidate!.relativePaths.map((relativePath) => ({ relativePath, bytes: source.readBytes(relativePath) }));
  return { archive, interpretation, files, root };
}

describe("archive forensic features", () => {
  it("masks Sensitive Findings in presentation, search, and evidence without changing raw bytes", async () => {
    const { archive, interpretation, files } = await setup();
    const secret = "sk-abcdefghijklmnopqrstuvwxyz123456";
    interpretation.activities.push({
      id: "secret-activity",
      kind: "agent-output",
      evidenceAnchor: "secret.jsonl#L1",
      threadId: "main",
      sourceOrder: 999999,
      text: `credential ${secret}`
    });
    const secretFile = { relativePath: "secret.jsonl", bytes: new TextEncoder().encode(`{"token":"${secret}"}\n`) };
    const committed = await archive.commitCapture({ files: [...files, secretFile], interpretation });

    const detail = await archive.getJourney(committed.journeyId);
    expect(detail?.stage.sensitiveFindingCount).toBeGreaterThan(0);
    expect(detail?.stage.activities.find(({ id }) => id === "secret-activity")?.text).not.toContain(secret);
    expect((await archive.search({ query: "credential" }))[0]?.text).not.toContain(secret);
    expect(new TextDecoder().decode(await archive.readSourceFile(committed.revisionId, "secret.jsonl"))).not.toContain(secret);
    expect(new TextDecoder().decode(await archive.readSourceFile(committed.revisionId, "secret.jsonl", false))).toContain(secret);
    archive.close();
  });

  it("supports Projects and evidence-anchored Review Overlays", async () => {
    const { archive, interpretation, files } = await setup();
    const committed = await archive.commitCapture({ files, interpretation });
    const project = await archive.createProject("Acme");
    await archive.updateReviewOverlay(committed.journeyId, {
      displayTitle: "Reviewed greeting",
      projectId: project.id,
      tags: ["audit", "audit", " success "]
    });
    const anchor = interpretation.activities[0]!.evidenceAnchor;
    await archive.updateReviewAnnotation(committed.journeyId, anchor, { bookmarked: true, note: "Important evidence" });

    const detail = await archive.getJourney(committed.journeyId);
    expect(detail?.summary).toMatchObject({ title: "Reviewed greeting", projectName: "Acme", tags: ["audit", "success"] });
    expect(detail?.stage.annotations).toEqual([
      { evidenceAnchor: anchor, bookmarked: true, note: "Important evidence", resolved: true }
    ]);
    expect((await archive.listProjects())[0]).toMatchObject({ name: "Acme", journeyCount: 1 });
    archive.close();
  });

  it("deduplicates moved copies and flags divergent evidence claiming one Native Session Identity", async () => {
    const { archive, interpretation, files } = await setup();
    const original = await archive.commitCapture({
      files: [{ relativePath: "original/session.jsonl", bytes: files[0]!.bytes }],
      interpretation
    });
    const moved = await archive.commitCapture({
      files: [{ relativePath: "moved/session.jsonl", bytes: files[0]!.bytes }],
      interpretation
    });
    expect(moved.revisionId).toBe(original.revisionId);
    const deduplicated = await archive.getJourney(original.journeyId);
    expect(deduplicated?.revisions).toHaveLength(1);
    expect(deduplicated?.revisions[0]?.observationCount).toBe(2);

    const divergentBytes = files[0]!.bytes.slice();
    divergentBytes[0] = (divergentBytes[0] ?? 0) ^ 1;
    const divergent = await archive.commitCapture({
      files: [{ relativePath: "original/session.jsonl", bytes: divergentBytes }],
      interpretation
    });
    const detail = await archive.getJourney(divergent.journeyId);
    expect(detail?.revisions.find(({ id }) => id === divergent.revisionId)?.identityConflict).toBe(true);
    archive.close();
  });

  it("recognizes an older prefix revision without mislabeling it as an Identity Conflict", async () => {
    const { archive, interpretation, files } = await setup();
    const newerBytes = new Uint8Array([...files[0]!.bytes, ...new TextEncoder().encode("\n")]);
    const newer = await archive.commitCapture({
      files: [{ relativePath: "session.jsonl", bytes: newerBytes }],
      interpretation,
      capturedAt: "2026-01-02T00:00:00.000Z"
    });
    const older = await archive.commitCapture({
      files: [{ relativePath: "session.jsonl", bytes: files[0]!.bytes }],
      interpretation,
      capturedAt: "2026-01-01T00:00:00.000Z"
    });
    const detail = await archive.getJourney(newer.journeyId);
    expect(detail?.summary.latestRevisionId).toBe(newer.revisionId);
    expect(detail?.revisions.find(({ id }) => id === older.revisionId)?.identityConflict).toBe(false);
    archive.close();
  });

  it("marks Review Overlay anchors unresolved instead of guessing after reinterpretation", async () => {
    const { archive, interpretation, files } = await setup();
    const first = await archive.commitCapture({ files, interpretation });
    const anchor = interpretation.activities[0]!.evidenceAnchor;
    await archive.updateReviewAnnotation(first.journeyId, anchor, { bookmarked: true, note: "Keep this evidence" });
    const rebuilt = structuredClone(interpretation);
    rebuilt.adapter.version = "2.0.0";
    rebuilt.activities = rebuilt.activities.filter(({ evidenceAnchor }) => evidenceAnchor !== anchor);
    await archive.commitCapture({ files, interpretation: rebuilt });
    const detail = await archive.getJourney(first.journeyId);
    expect(detail?.overlay.annotations[0]).toMatchObject({ evidenceAnchor: anchor, resolved: false });
    archive.close();
  });

  it("renames, merges, splits, and deletes logical Projects independently of Workspaces", async () => {
    const { archive, interpretation, files } = await setup();
    const first = await archive.commitCapture({ files, interpretation });
    const secondInterpretation = structuredClone(interpretation);
    secondInterpretation.journey.nativeSessionId = "second-project-session";
    const second = await archive.commitCapture({ files: [{ relativePath: "second.jsonl", bytes: files[0]!.bytes }], interpretation: secondInterpretation });
    const source = await archive.createProject("Source");
    const target = await archive.createProject("Target");
    await archive.updateReviewOverlay(first.journeyId, { projectId: source.id });
    await archive.updateReviewOverlay(second.journeyId, { projectId: target.id });
    expect((await archive.renameProject(source.id, "Renamed")).name).toBe("Renamed");
    expect((await archive.mergeProjects(source.id, target.id)).journeyCount).toBe(2);
    await archive.updateReviewOverlay(first.journeyId, { projectId: null });
    expect((await archive.listJourneys()).find(({ id }) => id === first.journeyId)?.projectId).toBeUndefined();
    expect(await archive.deleteProject(target.id)).toBe(true);
    expect((await archive.listProjects())).toEqual([]);
    archive.close();
  });

  it("resolves Fork lineage regardless of capture order", async () => {
    const { archive, interpretation, files } = await setup();
    const forkInterpretation = structuredClone(interpretation);
    forkInterpretation.journey.nativeSessionId = "fork-session";
    forkInterpretation.journey.parentNativeSessionId = "parent-session";
    const parentInterpretation = structuredClone(interpretation);
    parentInterpretation.journey.nativeSessionId = "parent-session";
    const fork = await archive.commitCapture({ files: [{ relativePath: "fork.jsonl", bytes: files[0]!.bytes }], interpretation: forkInterpretation });
    const parent = await archive.commitCapture({ files: [{ relativePath: "parent.jsonl", bytes: files[0]!.bytes }], interpretation: parentInterpretation });
    const summaries = await archive.listJourneys();
    expect(summaries.find(({ id }) => id === fork.journeyId)?.parentJourneyId).toBe(parent.journeyId);
    archive.close();
  });

  it("retains failed Source Bundles as Pending Evidence", async () => {
    const { archive, files } = await setup();
    const summary = await archive.savePendingEvidence({
      sourceAgent: "pi",
      nativeSessionId: "pending-session",
      adapterId: "fixture.adapter",
      adapterVersion: "1.0.0",
      candidate: { sourceAgent: "pi", nativeSessionId: "pending-session", relativePaths: files.map(({ relativePath }) => relativePath), locator: {} },
      error: "new record shape",
      files
    });
    expect(await archive.listPendingEvidence()).toEqual([summary]);
    const duplicate = await archive.savePendingEvidence({
      sourceAgent: "pi",
      nativeSessionId: "pending-session",
      adapterId: "fixture.adapter",
      adapterVersion: "1.0.0",
      candidate: { sourceAgent: "pi", nativeSessionId: "pending-session", relativePaths: files.map(({ relativePath }) => relativePath), locator: {} },
      error: "same evidence, newer error detail",
      files
    });
    expect(duplicate.id).toBe(summary.id);
    expect(await archive.listPendingEvidence()).toHaveLength(1);
    const pending = await archive.getPendingEvidence(summary.id);
    expect(pending?.files[0]?.bytes).toEqual(files[0]?.bytes);
    await archive.deletePendingEvidence(summary.id);
    expect(await archive.listPendingEvidence()).toEqual([]);
    archive.close();
  });

  it("lists revisions, searches exact evidence, verifies objects, and applies explicit retention", async () => {
    const { archive, interpretation, files } = await setup();
    const first = await archive.commitCapture({ files, interpretation, capturedAt: "2026-01-01T00:00:00.000Z" });
    const changedFiles = files.map((file, index) => index === 0 ? { ...file, bytes: new Uint8Array([...file.bytes, 10]) } : file);
    const second = await archive.commitCapture({ files: changedFiles, interpretation, capturedAt: "2026-01-02T00:00:00.000Z" });
    const detail = await archive.getJourney(second.journeyId);
    expect(detail?.revisions).toHaveLength(2);
    expect((await archive.searchEvidence(second.revisionId, "greeting")).length).toBeGreaterThan(0);
    expect((await archive.verify()).issues).toEqual([]);
    await archive.setRetentionPolicy(1);
    expect(await archive.applyRetentionPolicy()).toEqual({ deletedRevisions: 1 });
    expect((await archive.getJourney(second.journeyId))?.revisions).toHaveLength(1);
    expect(await archive.getJourney(second.journeyId, { revisionId: first.revisionId })).toBeUndefined();
    archive.close();
  });

  it("exports and re-imports checksummed data-only Journey Packages", async () => {
    const sourceArchive = await setup();
    const committed = await sourceArchive.archive.commitCapture({
      files: sourceArchive.files,
      interpretation: sourceArchive.interpretation
    });
    const project = await sourceArchive.archive.createProject("Portable project");
    await sourceArchive.archive.updateReviewOverlay(committed.journeyId, {
      displayTitle: "Portable Journey",
      projectId: project.id,
      tags: ["portable"]
    });
    const bytes = await sourceArchive.archive.exportJourneyPackage([committed.journeyId]);

    const destination = await setup();
    const imported = await destination.archive.importJourneyPackage(bytes);
    expect(imported).toMatchObject({ journeyIds: [committed.journeyId], revisions: 1, interpretations: 1 });
    const detail = await destination.archive.getJourney(committed.journeyId);
    expect(detail?.summary).toMatchObject({ title: "Portable Journey", projectName: "Portable project", tags: ["portable"] });
    expect(detail?.interpretations[0]?.provenance).toBe("external");
    const sourceFile = sourceArchive.files[0]!;
    expect(await destination.archive.readSourceFile(detail!.revisionId, sourceFile.relativePath, false)).toEqual(sourceFile.bytes);
    sourceArchive.archive.close();
    destination.archive.close();
  });

  it("rejects tampered Journey Package evidence before import", async () => {
    const source = await setup();
    const committed = await source.archive.commitCapture({ files: source.files, interpretation: source.interpretation });
    const packageBytes = await source.archive.exportJourneyPackage([committed.journeyId]);
    const entries = unzipSync(packageBytes);
    const evidenceEntry = Object.keys(entries).find((entry) => entry.startsWith("evidence/"))!;
    const evidenceBytes = entries[evidenceEntry]!;
    evidenceBytes[0] = (evidenceBytes[0] ?? 0) ^ 0xff;
    const tampered = zipSync(entries);
    const destination = await setup();
    await expect(destination.archive.importJourneyPackage(tampered)).rejects.toThrow(/checksum/u);
    expect(await destination.archive.listJourneys()).toEqual([]);
    source.archive.close();
    destination.archive.close();
  });

  it("detects and repairs untracked physical archive objects", async () => {
    const { archive, root } = await setup();
    const orphanHash = "a".repeat(64);
    const orphanDirectory = path.join(root, "objects", "sha256", orphanHash.slice(0, 2));
    await mkdir(orphanDirectory, { recursive: true });
    await writeFile(path.join(orphanDirectory, `${orphanHash.slice(2)}.gz`), "orphan");
    expect((await archive.verify()).issues.some(({ kind }) => kind === "orphan-object")).toBe(true);
    expect((await archive.repair()).issues).toEqual([]);
    archive.close();
  });

  it("deletes a Journey and creates a reversible Capture Exclusion", async () => {
    const { archive, interpretation, files } = await setup();
    const committed = await archive.commitCapture({ files, interpretation });
    expect(await archive.deleteJourney(committed.journeyId, true)).toBe(true);
    expect((await archive.verify()).checkedObjects).toBe(0);
    expect(await archive.isCaptureExcluded("pi", interpretation.journey.nativeSessionId)).toBe(true);
    await archive.removeCaptureExclusion("pi", interpretation.journey.nativeSessionId);
    expect(await archive.isCaptureExcluded("pi", interpretation.journey.nativeSessionId)).toBe(false);
    archive.close();
  });
});
