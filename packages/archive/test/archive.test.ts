import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { piAdapter } from "@agentjourney/builtin-adapters";
import { MemorySource } from "@agentjourney/plugin-sdk/testing";
import { fixturePath } from "@agentjourney/test-fixtures";
import { SqliteJourneyArchive } from "../src/index.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function readTree(root: string): Promise<Record<string, Uint8Array>> {
  const files: Record<string, Uint8Array> = {};
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolutePath);
      else if (entry.isFile()) {
        files[path.relative(root, absolutePath).split(path.sep).join("/")] = await readFile(absolutePath);
      }
    }
  };
  await visit(root);
  return files;
}

async function fixtureCapture() {
  const files = await readTree(fixturePath("pi"));
  const source = new MemorySource(files, "pi-fixture");
  const [candidate] = await piAdapter.discover(source);
  if (!candidate) throw new Error("missing Pi fixture candidate");
  const interpretation = await piAdapter.interpret(candidate, source);
  return {
    files: candidate.relativePaths.map((relativePath) => ({ relativePath, bytes: source.readBytes(relativePath) })),
    interpretation
  };
}

describe("SqliteJourneyArchive", () => {
  it("commits exact source bytes and exposes a stage document", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "agentjourney-archive-"));
    temporaryRoots.push(root);
    const archive = await SqliteJourneyArchive.open(root);
    const capture = await fixtureCapture();

    const committed = await archive.commitCapture(capture);
    expect(committed.newJourney).toBe(true);
    expect(committed.newRevision).toBe(true);

    const journeys = await archive.listJourneys();
    expect(journeys).toHaveLength(1);
    expect(journeys[0]?.sourceAgent).toBe("pi");
    expect(journeys[0]?.activityCount).toBeGreaterThan(0);

    const detail = await archive.getJourney(committed.journeyId);
    expect(detail?.stage.activities).toHaveLength(capture.interpretation.activities.length);
    expect(detail?.stage.revisionId).toBe(committed.revisionId);

    const sourceFile = capture.files[0]!;
    const restored = await archive.readSourceFile(committed.revisionId, sourceFile.relativePath, false);
    expect(restored).toEqual(sourceFile.bytes);
    archive.close();
  });

  it("is idempotent and creates a revision only when source bytes change", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "agentjourney-archive-"));
    temporaryRoots.push(root);
    const archive = await SqliteJourneyArchive.open(root);
    const capture = await fixtureCapture();

    const first = await archive.commitCapture(capture);
    const repeated = await archive.commitCapture(capture);
    expect(repeated).toMatchObject({
      journeyId: first.journeyId,
      revisionId: first.revisionId,
      interpretationId: first.interpretationId,
      newJourney: false,
      newRevision: false,
      newInterpretation: false
    });

    const changed = {
      ...capture,
      files: capture.files.map((file, index) =>
        index === 0
          ? { ...file, bytes: new Uint8Array([...file.bytes, ...new TextEncoder().encode("\n")]) }
          : file
      )
    };
    const second = await archive.commitCapture(changed);
    expect(second.journeyId).toBe(first.journeyId);
    expect(second.revisionId).not.toBe(first.revisionId);
    expect(second.newRevision).toBe(true);
    archive.close();
  });

  it("searches only canonical activity text", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "agentjourney-archive-"));
    temporaryRoots.push(root);
    const archive = await SqliteJourneyArchive.open(root);
    await archive.commitCapture(await fixtureCapture());

    const hits = await archive.search("greeting constant");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.sourceAgent).toBe("pi");
    expect((await archive.search({ query: "greet*", kind: "agent-output" })).length).toBeGreaterThan(0);
    expect((await archive.search({ query: "\"greeting constant\"" })).length).toBeGreaterThan(0);
    expect(await archive.search("definitely-not-present")).toEqual([]);
    archive.close();
  });

  it("rejects Source Bundle paths that escape the archive manifest", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "agentjourney-archive-"));
    temporaryRoots.push(root);
    const archive = await SqliteJourneyArchive.open(root);
    const capture = await fixtureCapture();

    await expect(
      archive.commitCapture({
        ...capture,
        files: [{ relativePath: "../secret", bytes: new TextEncoder().encode("no") }]
      })
    ).rejects.toThrow(/portable and relative/u);
    archive.close();
  });
});
