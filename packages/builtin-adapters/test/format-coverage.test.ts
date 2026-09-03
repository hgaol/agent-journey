import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MemorySource } from "@agentjourney/plugin-sdk/testing";
import { fixturePath } from "@agentjourney/test-fixtures";
import { canAutoPlayReplay, deriveReplayFrames } from "@agentjourney/activity-graph";
import { claudeCodeAdapter, codexCliAdapter, copilotCliAdapter, piAdapter } from "../src/index.js";

async function readTree(root: string): Promise<Record<string, Uint8Array>> {
  const result: Record<string, Uint8Array> = {};
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else result[path.relative(root, absolute).split(path.sep).join("/")] = await readFile(absolute);
    }
  };
  await visit(root);
  return result;
}

describe("built-in source format coverage", () => {
  it.each([
    ["claude-code", claudeCodeAdapter],
    ["codex-cli", codexCliAdapter],
    ["github-copilot-cli", copilotCliAdapter]
  ] as const)("preserves nested Agent Threads for %s", async (sourceAgent, adapter) => {
    const source = new MemorySource(await readTree(fixturePath(sourceAgent)));
    const [candidate] = await adapter.discover(source);
    const interpretation = await adapter.interpret(candidate!, source);
    expect(interpretation.threads.length).toBeGreaterThan(1);
    expect(interpretation.fidelity.agentThreads).toBe(true);
  });

  it("keeps untimed Claude control records replayable through explicit source-order placement", async () => {
    const source = new MemorySource(await readTree(fixturePath("claude-code")));
    const [candidate] = await claudeCodeAdapter.discover(source);
    const interpretation = await claudeCodeAdapter.interpret(candidate!, source);
    const frames = deriveReplayFrames(interpretation.activities, { streamMode: "events" });
    expect(frames.some(({ timing }) => timing === "step")).toBe(false);
    expect(frames.some(({ timing }) => timing === "source-order")).toBe(true);
    expect(canAutoPlayReplay(frames, "events")).toBe(true);
  });

  it("uses Claude's generated title and classifies current cost-state records", async () => {
    const source = new MemorySource({
      "session.jsonl": [
        JSON.stringify({ type: "user", sessionId: "current-claude", message: { role: "user", content: "<command-name>/effort</command-name>" } }),
        JSON.stringify({ type: "ai-title", sessionId: "current-claude", aiTitle: "Refine renderer" }),
        JSON.stringify({ type: "cost-state", sessionId: "current-claude", totalCostUsd: 0.12 })
      ].join("\n")
    });
    const [candidate] = await claudeCodeAdapter.discover(source);
    expect(candidate?.title).toBe("Refine renderer");
    const interpretation = await claudeCodeAdapter.interpret(candidate!, source);
    expect(interpretation.activities.some(({ kind, nativeName }) =>
      kind === "usage-observation" && nativeName === "cost-state"
    )).toBe(true);
  });

  it("preserves Claude parent UUID relationships as causal links", async () => {
    const source = new MemorySource(await readTree(fixturePath("claude-code")));
    const [candidate] = await claudeCodeAdapter.discover(source);
    const interpretation = await claudeCodeAdapter.interpret(candidate!, source);
    expect(interpretation.activities.some(({ links }) => links?.some(({ relation }) => relation === "parent"))).toBe(true);
  });

  it("preserves Pi parent relationships as causal links", async () => {
    const source = new MemorySource(await readTree(fixturePath("pi")));
    const [candidate] = await piAdapter.discover(source);
    const interpretation = await piAdapter.interpret(candidate!, source);
    expect(interpretation.activities.some(({ links }) => links?.some(({ relation }) => relation === "parent"))).toBe(true);
  });

  it("defers a stable revision when a JSONL file ends in a partial write", async () => {
    const source = new MemorySource({
      "project/session.jsonl": `${JSON.stringify({ type: "session", version: 3, id: "partial", timestamp: "2026-01-01T00:00:00Z", cwd: "/workspace" })}\n{\"type\":\"message\"`
    });
    const [candidate] = await piAdapter.discover(source);
    await expect(piAdapter.interpret(candidate!, source)).rejects.toThrow(/incomplete JSON record/u);
  });

  it("retains malformed records and future records with explicit dispositions", async () => {
    const source = new MemorySource({
      "project/session.jsonl": [
        JSON.stringify({ type: "session", version: 3, id: "malformed-session", timestamp: "2026-01-01T00:00:00Z", cwd: "/workspace" }),
        "{not-json",
        JSON.stringify({ type: "future_record", id: "future" })
      ].join("\n")
    });
    const [candidate] = await piAdapter.discover(source);
    const interpretation = await piAdapter.interpret(candidate!, source);
    expect(interpretation.coverage.dispositions.map(({ disposition }) => disposition)).toEqual(["metadata", "malformed", "unclassified"]);
    expect(interpretation.activities.some(({ kind }) => kind === "unclassified")).toBe(true);
  });

  it("decodes JSON-encoded Codex tool arguments for native rendering", async () => {
    const source = new MemorySource(await readTree(fixturePath("codex-cli")));
    const [candidate] = await codexCliAdapter.discover(source);
    const interpretation = await codexCliAdapter.interpret(candidate!, source);
    const invocation = interpretation.activities.find(({ kind }) => kind === "tool-invocation");
    expect(invocation?.payload).toEqual({ cmd: "pnpm test greeting" });
    expect(interpretation.activities).toContainEqual(expect.objectContaining({
      kind: "diagnostic",
      nativeName: "turn_aborted",
      text: "Conversation interrupted"
    }));
    expect(interpretation.activities).toContainEqual(expect.objectContaining({
      kind: "context-injection",
      text: expect.stringContaining("<turn_aborted>")
    }));
  });

  it("projects current Codex web-search records as one native tool row", async () => {
    const source = new MemorySource({
      "rollout.jsonl": [
        JSON.stringify({ type: "session_meta", timestamp: "2026-01-01T00:00:00Z", payload: { id: "web-search", cwd: "/workspace" } }),
        JSON.stringify({ type: "event_msg", timestamp: "2026-01-01T00:00:01Z", payload: { type: "web_search_end", call_id: "call-1", query: "Codex docs", action: { type: "search", query: "Codex docs" } } }),
        JSON.stringify({ type: "response_item", timestamp: "2026-01-01T00:00:02Z", payload: { type: "web_search_call", status: "completed", action: { type: "search", query: "Codex docs" } } })
      ].join("\n")
    });
    const [candidate] = await codexCliAdapter.discover(source);
    const interpretation = await codexCliAdapter.interpret(candidate!, source);
    const searches = interpretation.activities.filter(({ nativeName }) => nativeName === "web_search");
    expect(searches).toHaveLength(1);
    expect(searches[0]?.payload).toEqual({ type: "search", query: "Codex docs" });
    expect(interpretation.coverage.dispositions.some(({ detail, disposition }) =>
      disposition === "transport" && detail?.includes("web_search_end")
    )).toBe(true);
  });

  it("supports legacy Codex response-item-only conversations without mislabeling injected context", async () => {
    const source = new MemorySource({
      "rollout-legacy.jsonl": [
        JSON.stringify({ type: "session_meta", timestamp: "2025-01-01T00:00:00Z", payload: { id: "legacy", cwd: "/workspace", cli_version: "0.1.0" } }),
        JSON.stringify({ type: "response_item", timestamp: "2025-01-01T00:00:01Z", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "# AGENTS.md instructions\\n<INSTRUCTIONS>rules</INSTRUCTIONS>" }] } }),
        JSON.stringify({ type: "response_item", timestamp: "2025-01-01T00:00:02Z", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "Fix the test" }] } }),
        JSON.stringify({ type: "response_item", timestamp: "2025-01-01T00:00:03Z", payload: { type: "message", role: "assistant", content: [{ type: "output_text", text: "Fixed." }] } })
      ].join("\n")
    });
    const [candidate] = await codexCliAdapter.discover(source);
    const interpretation = await codexCliAdapter.interpret(candidate!, source);
    expect(interpretation.activities.map(({ kind }) => kind)).toEqual(["context-injection", "human-input", "agent-output"]);
  });

  it("keeps Codex forks as separate parent-linked Journeys", async () => {
    const source = new MemorySource({
      "rollout-parent.jsonl": JSON.stringify({ type: "session_meta", timestamp: "2026-01-01T00:00:00Z", payload: { id: "parent", cwd: "/workspace" } }),
      "rollout-fork.jsonl": JSON.stringify({ type: "session_meta", timestamp: "2026-01-01T00:01:00Z", payload: { id: "fork", forked_from_id: "parent", cwd: "/workspace" } })
    });
    const candidates = await codexCliAdapter.discover(source);
    expect(candidates).toHaveLength(2);
    const fork = candidates.find(({ nativeSessionId }) => nativeSessionId === "fork")!;
    const interpretation = await codexCliAdapter.interpret(fork, source);
    expect(interpretation.journey.parentNativeSessionId).toBe("parent");
  });

  it("reconciles evidenced Codex stream deltas into a Delivery Trace", async () => {
    const source = new MemorySource({
      "rollout-stream.jsonl": [
        JSON.stringify({ type: "session_meta", timestamp: "2026-01-01T00:00:00Z", payload: { id: "stream", cwd: "/workspace" } }),
        JSON.stringify({ type: "event_msg", timestamp: "2026-01-01T00:00:01Z", payload: { type: "agent_message_delta", delta: "Hel" } }),
        JSON.stringify({ type: "event_msg", timestamp: "2026-01-01T00:00:02Z", payload: { type: "agent_message_delta", delta: "lo" } }),
        JSON.stringify({ type: "event_msg", timestamp: "2026-01-01T00:00:03Z", payload: { type: "agent_message", message: "Hello" } })
      ].join("\n")
    });
    const [candidate] = await codexCliAdapter.discover(source);
    const interpretation = await codexCliAdapter.interpret(candidate!, source);
    const output = interpretation.activities.find(({ kind }) => kind === "agent-output");
    expect(output?.text).toBe("Hello");
    expect(output?.deliveryTrace?.map(({ text }) => text)).toEqual(["Hel", "lo"]);
    expect(interpretation.fidelity.deliveryTraces).toBe(true);
  });

  it("derives stable Activity and Evidence Anchor identities deterministically", async () => {
    const source = new MemorySource(await readTree(fixturePath("pi")));
    const [candidate] = await piAdapter.discover(source);
    const first = await piAdapter.interpret(candidate!, source);
    const second = await piAdapter.interpret(candidate!, source);
    expect(second.activities.map(({ id }) => id)).toEqual(first.activities.map(({ id }) => id));
    expect(second.activities.map(({ evidenceAnchor }) => evidenceAnchor)).toEqual(first.activities.map(({ evidenceAnchor }) => evidenceAnchor));
  });

  it("preserves timestamps on unclassified Copilot records so one unknown event cannot disable Replay", async () => {
    const source = new MemorySource({
      "copilot-session/events.jsonl": [
        JSON.stringify({ type: "session.start", timestamp: "2026-01-01T00:00:00Z", data: { sessionId: "copilot-timestamp", context: { cwd: "/workspace" } } }),
        JSON.stringify({ type: "user.message", timestamp: "2026-01-01T00:00:01Z", data: { content: "Hello" } }),
        JSON.stringify({ type: "future.copilot.event", timestamp: "2026-01-01T00:00:02Z", data: { value: true } })
      ].join("\n")
    });
    const [candidate] = await copilotCliAdapter.discover(source);
    const interpretation = await copilotCliAdapter.interpret(candidate!, source);
    const unknown = interpretation.activities.find(({ kind }) => kind === "unclassified");
    expect(unknown?.timestamp).toBe("2026-01-01T00:00:02.000Z");
    const frames = deriveReplayFrames(interpretation.activities, { streamMode: "events" });
    expect(frames.length).toBeGreaterThan(1);
    expect(frames.every(({ timing }) => timing === "evidenced")).toBe(true);
  });

  it("treats remote-steerability control records as transport rather than transcript activity", async () => {
    const source = new MemorySource(await readTree(fixturePath("github-copilot-cli")));
    const [candidate] = await copilotCliAdapter.discover(source);
    const interpretation = await copilotCliAdapter.interpret(candidate!, source);
    const disposition = interpretation.coverage.dispositions.find(({ detail }) =>
      detail?.includes("session.remote_steerable_changed")
    );
    expect(disposition).toMatchObject({ disposition: "transport" });
    expect(disposition?.activityIds).toBeUndefined();
  });

  it("retains evidenced native turn identifiers where available", async () => {
    const source = new MemorySource(await readTree(fixturePath("github-copilot-cli")));
    const [candidate] = await copilotCliAdapter.discover(source);
    const interpretation = await copilotCliAdapter.interpret(candidate!, source);
    expect(interpretation.activities.some(({ turnId }) => turnId === "turn-1")).toBe(true);
  });
});
