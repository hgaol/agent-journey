import type { DiscoveredJourney, SourceAdapterPlugin, SourceBundleView, VirtualSource } from "@agentjourney/plugin-sdk";
import {
  InterpretationBuilder,
  assertNoTrailingPartialJson,
  asArray,
  asRecord,
  asString,
  firstText,
  jsonValue,
  normalizeTimestamp,
  parseJsonLines,
  textFrom,
  toolCapabilities
} from "./utils.js";

const manifest = {
  id: "builtin.claude-code",
  version: "0.1.2",
  interfaceVersion: "1.0.0",
  displayName: "Claude Code",
  sourceAgent: "claude-code",
  defaultRootSegments: {
    posix: [".claude", "projects"],
    windows: [".claude", "projects"]
  }
} as const;

async function discover(source: VirtualSource): Promise<DiscoveredJourney[]> {
  const entries = await source.list();
  const mainFiles = entries
    .map(({ path: filePath }) => filePath.replaceAll("\\", "/"))
    .filter((filePath) => filePath.endsWith(".jsonl") && !filePath.includes("/subagents/"));

  const candidates: DiscoveredJourney[] = [];
  for (const mainPath of mainFiles) {
    const lines = parseJsonLines(mainPath, await source.readText(mainPath));
    let nativeSessionId = mainPath.split("/").at(-1)?.replace(/\.jsonl$/u, "") ?? mainPath;
    let title: string | undefined;
    let workspace: string | undefined;
    let sourceAgentVersion: string | undefined;
    let startedAt: string | undefined;

    for (const line of lines.slice(0, 80)) {
      const record = line.value;
      if (!record) continue;
      nativeSessionId = asString(record.sessionId) ?? asString(record.session_id) ?? nativeSessionId;
      workspace ??= asString(record.cwd);
      sourceAgentVersion ??= asString(record.version);
      startedAt ??= normalizeTimestamp(record.timestamp);
      if (record.type === "ai-title") title = asString(record.aiTitle) ?? title;
      if (record.type === "user" && !record.isMeta) {
        title ??= firstText(asRecord(record.message)?.content)?.slice(0, 120);
      }
    }

    const turnCountEstimate = lines.filter(({ value: record }) => {
      if (record?.type !== "user" || record.isMeta === true) return false;
      const content = asRecord(record.message)?.content;
      return Array.isArray(content)
        ? content.some((block) => asRecord(block)?.type !== "tool_result")
        : content !== undefined;
    }).length;

    const sessionFolder = `${mainPath.slice(0, -".jsonl".length)}/`;
    const relativePaths = entries
      .map(({ path: filePath }) => filePath.replaceAll("\\", "/"))
      .filter((filePath) => filePath === mainPath || filePath.startsWith(sessionFolder))
      .sort();

    candidates.push({
      sourceAgent: manifest.sourceAgent,
      nativeSessionId,
      relativePaths,
      ...(title ? { title } : {}),
      ...(workspace ? { workspace } : {}),
      ...(sourceAgentVersion ? { sourceAgentVersion } : {}),
      ...(startedAt ? { startedAt } : {}),
      turnCountEstimate,
      locator: { mainPath }
    });
  }

  return candidates.sort((left, right) => (right.startedAt ?? "").localeCompare(left.startedAt ?? ""));
}

function parseFile(
  relativePath: string,
  fileIndex: number,
  threadId: string,
  bundle: SourceBundleView,
  builder: InterpretationBuilder,
  metadata: Record<string, string | undefined>,
  toolCalls: Map<string, string>
): void {
  const sourceText = bundle.readText(relativePath);
  const lines = parseJsonLines(relativePath, sourceText);
  assertNoTrailingPartialJson(sourceText, lines);
  const recordActivities = new Map<string, string>();
  if (threadId !== "main") builder.addThread({ id: threadId, parentThreadId: "main", label: threadId });

  for (const line of lines) {
    if (!line.value) {
      builder.malformed(line);
      continue;
    }
    const record = line.value;
    const type = asString(record.type) ?? "unknown";
    const timestamp = normalizeTimestamp(record.timestamp);
    const sourceBase = fileIndex * 1_000_000 + line.line * 1000;
    const recordActivityIds: string[] = [];
    const parentUuid = asString(record.parentUuid);
    const parentActivityId = parentUuid ? recordActivities.get(parentUuid) : undefined;
    const finishRelationships = (): void => {
      if (parentActivityId) {
        builder.addLinks(recordActivityIds, [{ relation: "parent", targetActivityId: parentActivityId }]);
      }
      const uuid = asString(record.uuid);
      if (uuid && recordActivityIds[0]) recordActivities.set(uuid, recordActivityIds[0]);
    };

    metadata.nativeSessionId ??= asString(record.sessionId) ?? asString(record.session_id);
    metadata.workspace ??= asString(record.cwd);
    metadata.sourceAgentVersion ??= asString(record.version);
    metadata.gitBranch ??= asString(record.gitBranch);
    metadata.startedAt ??= timestamp;

    if (type === "user" || type === "assistant") {
      const message = asRecord(record.message) ?? {};
      const model = asString(message.model);
      if (model) builder.models.add(model);
      const content = Array.isArray(message.content)
        ? message.content
        : message.content === undefined
          ? []
          : [{ type: "text", text: message.content }];

      content.forEach((rawBlock, blockIndex) => {
        const block = asRecord(rawBlock);
        if (!block) return;
        const blockType = asString(block.type) ?? "text";
        const anchor = `${line.anchor}/content/${blockIndex}`;
        const sourceOrder = sourceBase + blockIndex;

        if (blockType === "thinking") {
          recordActivityIds.push(
            builder.addActivity({
              kind: "reasoning",
              anchor,
              sourceOrder,
              threadId,
              timestamp,
              actor: "agent",
              text: textFrom(block.thinking ?? block.text),
              payload: jsonValue(block)
            })
          );
          return;
        }

        if (blockType === "tool_use") {
          const nativeName = asString(block.name) ?? "unknown-tool";
          const activityId = builder.addActivity({
            kind: "tool-invocation",
            anchor,
            sourceOrder,
            threadId,
            timestamp,
            actor: "agent",
            nativeName,
            toolCapabilities: toolCapabilities(nativeName),
            status: "unknown",
            payload: jsonValue(block.input ?? block)
          });
          const callId = asString(block.id);
          if (callId) toolCalls.set(callId, activityId);
          recordActivityIds.push(activityId);
          return;
        }

        if (blockType === "tool_result") {
          const callId = asString(block.tool_use_id);
          const targetActivityId = callId ? toolCalls.get(callId) : undefined;
          recordActivityIds.push(
            builder.addActivity({
              kind: "tool-result",
              anchor,
              sourceOrder,
              threadId,
              timestamp,
              actor: "tool",
              status: block.is_error === true ? "failed" : "succeeded",
              text: textFrom(block.content),
              payload: jsonValue(block),
              ...(targetActivityId
                ? { links: [{ relation: "result-of", targetActivityId }] }
                : {})
            })
          );
          return;
        }

        const text = textFrom(block.text ?? block.content ?? rawBlock);
        if (text.length === 0) return;
        const isInjected = type === "user" && (record.isMeta === true || message.isMeta === true);
        recordActivityIds.push(
          builder.addActivity({
            kind: type === "assistant" ? "agent-output" : isInjected ? "context-injection" : "human-input",
            anchor,
            sourceOrder,
            threadId,
            timestamp,
            actor: type === "assistant" ? "agent" : isInjected ? "system" : "human",
            text,
            payload: jsonValue(block)
          })
        );
      });

      finishRelationships();
      if (recordActivityIds.length > 0) builder.disposition(line.anchor, "canonical", recordActivityIds);
      else builder.disposition(line.anchor, "transport", [], "message record contained no renderable content");
      continue;
    }

    if (type === "system") {
      const subtype = asString(record.subtype) ?? "system";
      const id = builder.addActivity({
        kind: subtype.includes("error") ? "diagnostic" : "state-transition",
        anchor: line.anchor,
        sourceOrder: sourceBase,
        threadId,
        timestamp,
        actor: "system",
        nativeName: subtype,
        text: firstText(record.content ?? asRecord(record.message)?.content),
        payload: jsonValue(record)
      });
      recordActivityIds.push(id);
      finishRelationships();
      builder.disposition(line.anchor, "canonical", [id]);
      continue;
    }

    if (["mode", "permission-mode", "model-change", "atis-latch", "agent-name"].includes(type)) {
      const id = builder.addActivity({
        kind: "state-transition",
        anchor: line.anchor,
        sourceOrder: sourceBase,
        threadId,
        timestamp,
        actor: "system",
        nativeName: type,
        payload: jsonValue(record)
      });
      recordActivityIds.push(id);
      finishRelationships();
      builder.disposition(line.anchor, "canonical", [id]);
      continue;
    }

    if (type === "attachment" || type.startsWith("file-history")) {
      const id = builder.addActivity({
        kind: "artifact",
        anchor: line.anchor,
        sourceOrder: sourceBase,
        threadId,
        timestamp,
        actor: "system",
        nativeName: type,
        payload: jsonValue(record)
      });
      recordActivityIds.push(id);
      finishRelationships();
      builder.disposition(line.anchor, "canonical", [id]);
      continue;
    }

    if (type === "cost-state") {
      const id = builder.addActivity({
        kind: "usage-observation",
        anchor: line.anchor,
        sourceOrder: sourceBase,
        threadId,
        timestamp,
        actor: "system",
        nativeName: type,
        payload: jsonValue(record)
      });
      finishRelationships();
      builder.disposition(line.anchor, "canonical", [id]);
      continue;
    }

    if (type === "ai-title") {
      metadata.title = asString(record.aiTitle) ?? metadata.title;
      builder.disposition(line.anchor, "metadata");
      continue;
    }

    if (["last-prompt", "queue-operation"].includes(type)) {
      builder.disposition(line.anchor, "transport", [], `${type} is retained as source transport detail`);
      continue;
    }

    builder.unclassified(line, `unknown Claude Code record type: ${type}`);
  }
}

async function interpret(candidate: DiscoveredJourney, bundle: SourceBundleView) {
  const builder = new InterpretationBuilder();
  const metadata: Record<string, string | undefined> = {
    nativeSessionId: candidate.nativeSessionId,
    title: candidate.title,
    workspace: candidate.workspace,
    sourceAgentVersion: candidate.sourceAgentVersion,
    startedAt: candidate.startedAt
  };
  const toolCalls = new Map<string, string>();
  const mainPath = asString(candidate.locator.mainPath) ?? candidate.relativePaths[0];
  if (!mainPath) throw new Error("Claude Code candidate has no main session file");

  const paths = candidate.relativePaths.filter((filePath) => filePath.endsWith(".jsonl"));
  paths.forEach((relativePath, fileIndex) => {
    const agentMatch = /\/subagents\/agent-([^/]+)\.jsonl$/u.exec(relativePath);
    const threadId = agentMatch?.[1] ? `agent:${agentMatch[1]}` : "main";
    parseFile(relativePath, fileIndex, threadId, bundle, builder, metadata, toolCalls);
  });

  return builder.build({
    adapterId: manifest.id,
    adapterVersion: manifest.version,
    sourceAgent: manifest.sourceAgent,
    nativeSessionId: metadata.nativeSessionId ?? candidate.nativeSessionId,
    ...(metadata.title ? { title: metadata.title } : {}),
    ...(metadata.workspace ? { workspace: metadata.workspace } : {}),
    ...(metadata.gitBranch ? { gitBranch: metadata.gitBranch } : {}),
    ...(metadata.sourceAgentVersion ? { sourceAgentVersion: metadata.sourceAgentVersion } : {}),
    ...(metadata.startedAt ? { startedAt: metadata.startedAt } : {})
  });
}

export const claudeCodeAdapter: SourceAdapterPlugin = { manifest, discover, interpret };
