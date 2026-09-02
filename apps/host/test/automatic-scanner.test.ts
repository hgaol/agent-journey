import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SqliteJourneyArchive } from "@agentjourney/archive";
import { builtInAdapters } from "@agentjourney/builtin-adapters";
import { fixturePath } from "@agentjourney/test-fixtures";
import { AutomaticScanner } from "../src/automatic-scanner.js";
import { CaptureCoordinator } from "../src/capture-coordinator.js";
import { EventHub } from "../src/event-hub.js";
import { SettingsStore } from "../src/settings.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function setup(policy: "manual" | "automatic") {
  const root = await mkdtemp(path.join(os.tmpdir(), "agentjourney-auto-"));
  roots.push(root);
  const archive = await SqliteJourneyArchive.open(path.join(root, "archive"));
  const settings = new SettingsStore(path.join(root, "settings.json"));
  await settings.load();
  await settings.approveSourceRoot({ sourceAgent: "pi", root: fixturePath("pi"), scanPolicy: policy });
  const coordinator = new CaptureCoordinator(builtInAdapters, archive, settings, new EventHub());
  return { archive, scanner: new AutomaticScanner(coordinator, settings, 10) };
}

describe("AutomaticScanner", () => {
  it("runs one batched Capture Cycle only for automatic Source Roots", async () => {
    const automatic = await setup("automatic");
    await Promise.all([automatic.scanner.runCycle(), automatic.scanner.runCycle()]);
    const journeys = await automatic.archive.listJourneys();
    expect(journeys).toHaveLength(1);
    const detail = await automatic.archive.getJourney(journeys[0]!.id);
    expect(detail?.revisions[0]?.observationCount).toBe(1);
    automatic.archive.close();

    const manual = await setup("manual");
    await manual.scanner.runCycle();
    expect(await manual.archive.listJourneys()).toHaveLength(0);
    manual.archive.close();
  });
});
