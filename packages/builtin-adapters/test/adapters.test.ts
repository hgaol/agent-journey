import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assertInterpretationDocument } from "@agentjourney/contracts/validate";
import { MemorySource, runSourceAdapterConformance } from "@agentjourney/plugin-sdk/testing";
import { fixturePath } from "@agentjourney/test-fixtures";
import type { SourceAdapterPlugin } from "@agentjourney/plugin-sdk";
import { claudeCodeAdapter, codexCliAdapter, copilotCliAdapter, piAdapter } from "../src/index.js";

async function readTree(root: string): Promise<Record<string, Uint8Array>> {
  const result: Record<string, Uint8Array> = {};
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolutePath);
      else if (entry.isFile()) {
        const relativePath = path.relative(root, absolutePath).split(path.sep).join("/");
        result[relativePath] = await readFile(absolutePath);
      }
    }
  };
  await visit(root);
  return result;
}

const cases: Array<{
  label: string;
  sourceAgent: "claude-code" | "codex-cli" | "pi" | "github-copilot-cli";
  adapter: SourceAdapterPlugin;
  nativeSessionId: string;
  expectedKinds: string[];
}> = [
  {
    label: "Claude Code",
    sourceAgent: "claude-code",
    adapter: claudeCodeAdapter,
    nativeSessionId: "11111111-1111-4111-8111-111111111111",
    expectedKinds: ["human-input", "reasoning", "tool-invocation", "tool-result", "agent-output"]
  },
  {
    label: "Codex CLI",
    sourceAgent: "codex-cli",
    adapter: codexCliAdapter,
    nativeSessionId: "22222222-2222-4222-8222-222222222222",
    expectedKinds: ["human-input", "context-injection", "reasoning", "tool-invocation", "tool-result", "agent-output", "usage-observation", "unclassified"]
  },
  {
    label: "Pi",
    sourceAgent: "pi",
    adapter: piAdapter,
    nativeSessionId: "33333333-3333-4333-8333-333333333333",
    expectedKinds: ["human-input", "reasoning", "tool-invocation", "tool-result", "agent-output"]
  },
  {
    label: "GitHub Copilot CLI",
    sourceAgent: "github-copilot-cli",
    adapter: copilotCliAdapter,
    nativeSessionId: "44444444-4444-4444-8444-444444444444",
    expectedKinds: ["human-input", "context-injection", "reasoning", "tool-invocation", "tool-result", "approval-request", "approval-decision", "agent-output", "usage-observation"]
  }
];

describe.each(cases)("$label adapter", ({ sourceAgent, adapter, nativeSessionId, expectedKinds }) => {
  it("discovers and interprets a sanitized native history without silent records", async () => {
    const source = new MemorySource(await readTree(fixturePath(sourceAgent)), sourceAgent);
    const candidates = await adapter.discover(source);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.nativeSessionId).toBe(nativeSessionId);

    const interpretation = await adapter.interpret(candidates[0]!, source);
    assertInterpretationDocument(interpretation);

    expect(interpretation.journey.sourceAgent).toBe(sourceAgent);
    expect(interpretation.journey.nativeSessionId).toBe(nativeSessionId);
    expect(interpretation.coverage.sourceRecordCount).toBe(interpretation.coverage.dispositions.length);
    expect(interpretation.coverage.dispositions.every(({ disposition }) => Boolean(disposition))).toBe(true);
    expect(interpretation.activities.every(({ evidenceAnchor }) => evidenceAnchor.length > 0)).toBe(true);

    const kinds = new Set(interpretation.activities.map(({ kind }) => kind));
    for (const kind of expectedKinds) expect(kinds.has(kind as never), `missing ${kind}`).toBe(true);
  });

  it("passes the public Source Adapter conformance suite", async () => {
    const source = new MemorySource(await readTree(fixturePath(sourceAgent)), sourceAgent);
    const result = await runSourceAdapterConformance(adapter, source);
    expect(result).toMatchObject({ candidates: 1, interpretations: 1 });
    expect(result.sourceRecords).toBeGreaterThan(0);
  });

  it("links native tool results back to tool invocations", async () => {
    const source = new MemorySource(await readTree(fixturePath(sourceAgent)), sourceAgent);
    const [candidate] = await adapter.discover(source);
    const interpretation = await adapter.interpret(candidate!, source);
    const invocationIds = new Set(
      interpretation.activities.filter(({ kind }) => kind === "tool-invocation").map(({ id }) => id)
    );
    const resultLinks = interpretation.activities
      .filter(({ kind }) => kind === "tool-result")
      .flatMap(({ links }) => links ?? [])
      .filter(({ relation }) => relation === "result-of");

    expect(resultLinks.length).toBeGreaterThan(0);
    expect(resultLinks.every(({ targetActivityId }) => invocationIds.has(targetActivityId))).toBe(true);
  });
});
