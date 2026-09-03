import type { DiscoveredJourney, SourceAdapterPlugin, SourceBundleView, VirtualSource } from "@agentjourney/plugin-sdk";
import {
  InterpretationBuilder,
  assertNoTrailingPartialJson,
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
  id: "builtin.pi",
  version: "0.2.2",
  interfaceVersion: "1.0.0",
  displayName: "Pi",
  sourceAgent: "pi",
  defaultRootSegments: {
    posix: [".pi", "agent", "sessions"],
    windows: [".pi", "agent", "sessions"]
  }
} as const;

async function discover(source: VirtualSource): Promise<DiscoveredJourney[]> {
  const entries = await source.list();
  const candidates: DiscoveredJourney[] = [];

  for (const entry of entries) {
    const relativePath = entry.path.replaceAll("\\", "/");
    if (!relativePath.endsWith(".jsonl")) continue;
    const lines = parseJsonLines(relativePath, await source.readText(relativePath));
    const header = lines.find(({ value }) => value?.type === "session")?.value;
    const nativeSessionId = asString(header?.id) ?? relativePath.split("/").at(-1)?.replace(/\.jsonl$/u, "");
    if (!nativeSessionId) continue;

    let title: string | undefined;
    let sourceAgentVersion = asString(header?.agentVersion) ?? asString(header?.piVersion);
    for (const line of lines.slice(0, 80)) {
      const record = line.value;
      if (!record) continue;
      if (record.type === "message") {
        const message = asRecord(record.message);
        if (message?.role === "user") title ??= firstText(message.content)?.slice(0, 120);
      }
      sourceAgentVersion ??= asString(record.agentVersion) ?? asString(record.piVersion);
    }

    const turnCountEstimate = lines.filter(({ value: record }) =>
      record?.type === "message" && asRecord(record.message)?.role === "user"
    ).length;
    const workspace = asString(header?.cwd);
    const startedAt = normalizeTimestamp(header?.timestamp);
    candidates.push({
      sourceAgent: manifest.sourceAgent,
      nativeSessionId,
      relativePaths: [relativePath],
      ...(title ? { title } : {}),
      ...(workspace ? { workspace } : {}),
      ...(sourceAgentVersion ? { sourceAgentVersion } : {}),
      ...(startedAt ? { startedAt } : {}),
      turnCountEstimate,
      locator: { mainPath: relativePath }
    });
  }

  return candidates.sort((left, right) => (right.startedAt ?? "").localeCompare(left.startedAt ?? ""));
}

async function interpret(candidate: DiscoveredJourney, bundle: SourceBundleView) {
  const mainPath = asString(candidate.locator.mainPath) ?? candidate.relativePaths[0];
  if (!mainPath) throw new Error("Pi candidate has no session file");

  const builder = new InterpretationBuilder();
  const sourceText = bundle.readText(mainPath);
  const lines = parseJsonLines(mainPath, sourceText);
  assertNoTrailingPartialJson(sourceText, lines);
  const sessionHeader = lines.find(({ value }) => value?.type === "session")?.value;
  const explicitPiVersion = asString(sessionHeader?.agentVersion) ?? asString(sessionHeader?.piVersion);
  const rawSessionFormatVersion = sessionHeader?.version;
  const sessionFormatVersion = typeof rawSessionFormatVersion === "string" || typeof rawSessionFormatVersion === "number"
    ? String(rawSessionFormatVersion)
    : undefined;
  const recordActivities = new Map<string, string>();
  const toolCalls = new Map<string, string>();
  let workspace = candidate.workspace;
  let sourceAgentVersion = explicitPiVersion
    ?? (candidate.sourceAgentVersion !== sessionFormatVersion ? candidate.sourceAgentVersion : undefined);
  let startedAt = candidate.startedAt;
  let title = candidate.title;
  let modelProvider: string | undefined;

  for (const line of lines) {
    if (!line.value) {
      builder.malformed(line);
      continue;
    }
    const record = line.value;
    const type = asString(record.type) ?? "unknown";
    const timestamp = normalizeTimestamp(record.timestamp);
    const sourceBase = line.line * 1000;
    const activityIds: string[] = [];
    const parentId = asString(record.parentId);
    const parentActivityId = parentId ? recordActivities.get(parentId) : undefined;
    const parentLinks = parentActivityId
      ? [{ relation: "parent" as const, targetActivityId: parentActivityId }]
      : undefined;

    if (type === "session") {
      workspace ??= asString(record.cwd);
      sourceAgentVersion ??= asString(record.agentVersion) ?? asString(record.piVersion);
      startedAt ??= timestamp;
      builder.disposition(line.anchor, "metadata");
      continue;
    }

    if (type === "model_change") {
      const model = asString(record.modelId);
      if (model) builder.models.add(model);
      modelProvider = asString(record.provider) ?? modelProvider;
      activityIds.push(
        builder.addActivity({
          kind: "state-transition",
          anchor: line.anchor,
          sourceOrder: sourceBase,
          timestamp,
          actor: "system",
          nativeName: "model-change",
          payload: jsonValue(record),
          ...(parentLinks ? { links: parentLinks } : {})
        })
      );
    } else if (type === "thinking_level_change" || type === "session_info" || type === "session_name") {
      activityIds.push(
        builder.addActivity({
          kind: "state-transition",
          anchor: line.anchor,
          sourceOrder: sourceBase,
          timestamp,
          actor: "system",
          nativeName: type,
          payload: jsonValue(record),
          ...(parentLinks ? { links: parentLinks } : {})
        })
      );
      if (type === "session_name") title = asString(record.name) ?? title;
    } else if (type === "message") {
      const message = asRecord(record.message) ?? {};
      const role = asString(message.role) ?? "unknown";
      const content = Array.isArray(message.content)
        ? message.content
        : message.content === undefined
          ? []
          : [{ type: "text", text: message.content }];

      if (role === "toolResult") {
        const callId = asString(message.toolCallId);
        const targetActivityId = callId ? toolCalls.get(callId) : undefined;
        activityIds.push(
          builder.addActivity({
            kind: "tool-result",
            anchor: `${line.anchor}/message`,
            sourceOrder: sourceBase,
            timestamp,
            actor: "tool",
            nativeName: asString(message.toolName),
            status: message.isError === true ? "failed" : "succeeded",
            text: textFrom(message.content),
            payload: jsonValue(message),
            links: [
              ...(parentLinks ?? []),
              ...(targetActivityId ? [{ relation: "result-of" as const, targetActivityId }] : [])
            ]
          })
        );
      } else {
        content.forEach((rawBlock, blockIndex) => {
          const block = asRecord(rawBlock);
          if (!block) return;
          const blockType = asString(block.type) ?? "text";
          const anchor = `${line.anchor}/message/content/${blockIndex}`;
          const sourceOrder = sourceBase + blockIndex;

          if (blockType === "thinking") {
            const reasoning = textFrom(block.thinking ?? block.text);
            if (!reasoning.trim()) return;
            activityIds.push(
              builder.addActivity({
                kind: "reasoning",
                anchor,
                sourceOrder,
                timestamp,
                actor: "agent",
                text: reasoning,
                payload: jsonValue(block),
                ...(parentLinks ? { links: parentLinks } : {})
              })
            );
          } else if (blockType === "toolCall") {
            const nativeName = asString(block.name) ?? "unknown-tool";
            const activityId = builder.addActivity({
              kind: "tool-invocation",
              anchor,
              sourceOrder,
              timestamp,
              actor: "agent",
              nativeName,
              toolCapabilities: toolCapabilities(nativeName),
              status: "unknown",
              payload: jsonValue(block.arguments ?? block),
              ...(parentLinks ? { links: parentLinks } : {})
            });
            const callId = asString(block.id);
            if (callId) toolCalls.set(callId, activityId);
            activityIds.push(activityId);
          } else {
            const text = textFrom(block.text ?? block.content ?? rawBlock);
            if (!text) return;
            activityIds.push(
              builder.addActivity({
                kind: role === "assistant" ? "agent-output" : role === "user" ? "human-input" : "context-injection",
                anchor,
                sourceOrder,
                timestamp,
                actor: role === "assistant" ? "agent" : role === "user" ? "human" : "system",
                text,
                payload: jsonValue(block),
                ...(parentLinks ? { links: parentLinks } : {})
              })
            );
            if (role === "user") title ??= text.slice(0, 120);
          }
        });
      }
    } else {
      builder.unclassified(line, `unknown Pi record type: ${type}`);
      continue;
    }

    if (activityIds.length > 0) {
      builder.disposition(line.anchor, "canonical", activityIds);
      const recordId = asString(record.id);
      if (recordId) recordActivities.set(recordId, activityIds[0] as string);
    } else {
      builder.disposition(line.anchor, "transport", [], `${type} contained no renderable content`);
    }
  }

  return builder.build({
    adapterId: manifest.id,
    adapterVersion: manifest.version,
    sourceAgent: manifest.sourceAgent,
    nativeSessionId: candidate.nativeSessionId,
    ...(title ? { title } : {}),
    ...(workspace ? { workspace } : {}),
    ...(sourceAgentVersion ? { sourceAgentVersion } : {}),
    ...(modelProvider ? { modelProvider } : {}),
    ...(startedAt ? { startedAt } : {})
  });
}

export const piAdapter: SourceAdapterPlugin = { manifest, discover, interpret };
