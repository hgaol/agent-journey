import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { InterpretationDocument } from "@agentjourney/contracts";
import { SqliteJourneyArchive } from "@agentjourney/archive";
import type { SourceAdapterPlugin } from "@agentjourney/plugin-sdk";
import { CaptureCoordinator } from "../src/capture-coordinator.js";
import { EventHub } from "../src/event-hub.js";
import { SettingsStore } from "../src/settings.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

function interpretation(): InterpretationDocument {
  return {
    schemaVersion: "1.0.0",
    adapter: { id: "fixture.failable", version: "1.0.0" },
    journey: { sourceAgent: "fixture-agent", nativeSessionId: "fixture-session" },
    activities: [{ id: "a", kind: "agent-output", evidenceAnchor: "session.jsonl#L1", threadId: "main", sourceOrder: 1, text: "recovered" }],
    threads: [{ id: "main" }],
    coverage: { sourceRecordCount: 1, dispositions: [{ evidenceAnchor: "session.jsonl#L1", disposition: "canonical", activityIds: ["a"] }], missing: [] },
    fidelity: { contentKinds: ["agent-output"], timedKinds: [], deliveryTraces: false, agentThreads: false, causalLinks: false, terminalStream: false, knownGaps: [] }
  };
}

describe("CaptureCoordinator", () => {
  it("imports explicitly selected native raw files without a Source Root grant", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "agentjourney-coordinator-"));
    roots.push(root);
    const archive = await SqliteJourneyArchive.open(path.join(root, "archive"));
    const settings = new SettingsStore(path.join(root, "settings.json"));
    await settings.load();
    const coordinator = new CaptureCoordinator(
      [(await import("@agentjourney/builtin-adapters")).piAdapter],
      archive,
      settings,
      new EventHub()
    );
    const raw = [
      JSON.stringify({ type: "session", version: 3, id: "manual-import", timestamp: "2026-01-01T00:00:00Z", cwd: "/workspace" }),
      JSON.stringify({ type: "message", id: "m1", parentId: null, timestamp: "2026-01-01T00:00:01Z", message: { role: "user", content: "Imported manually" } })
    ].join("\n");
    const outcome = await coordinator.importSourceBundle("pi", [{ relativePath: "manual.jsonl", bytes: new TextEncoder().encode(raw) }]);
    expect(outcome.results).toHaveLength(1);
    expect(await archive.listJourneys()).toHaveLength(1);
    archive.close();
  });

  it("retains interpretation failures and retries from preserved evidence", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "agentjourney-coordinator-"));
    roots.push(root);
    const sourceRoot = path.join(root, "source");
    await mkdir(sourceRoot);
    await writeFile(path.join(sourceRoot, "session.jsonl"), "{}\n");
    let fails = true;
    const adapter: SourceAdapterPlugin = {
      manifest: {
        id: "fixture.failable",
        version: "1.0.0",
        interfaceVersion: "1.0.0",
        displayName: "Failable",
        sourceAgent: "fixture-agent",
        defaultRootSegments: { posix: [], windows: [] }
      },
      async discover() {
        return [{ sourceAgent: "fixture-agent", nativeSessionId: "fixture-session", relativePaths: ["session.jsonl"], locator: { mainPath: "session.jsonl" } }];
      },
      async interpret() {
        if (fails) throw new Error("unsupported fixture shape");
        return interpretation();
      }
    };
    const archive = await SqliteJourneyArchive.open(path.join(root, "archive"));
    const settings = new SettingsStore(path.join(root, "settings.json"));
    await settings.load();
    await settings.approveSourceRoot({ sourceAgent: "fixture-agent", root: sourceRoot, scanPolicy: "manual" });
    const coordinator = new CaptureCoordinator([adapter], archive, settings, new EventHub());

    const outcome = await coordinator.capture("fixture-agent");
    expect(outcome.results).toEqual([]);
    expect(outcome.pending).toHaveLength(1);
    expect(await archive.listJourneys()).toEqual([]);

    fails = false;
    const committed = await coordinator.retryPending(outcome.pending[0]!.id);
    expect(committed.newJourney).toBe(true);
    expect(await archive.listPendingEvidence()).toEqual([]);
    expect(await archive.listJourneys()).toHaveLength(1);
    archive.close();
  });
});
