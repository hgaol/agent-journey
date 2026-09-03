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
  statusFrom,
  textFrom,
  toolCapabilities
} from "./utils.js";

const manifest = {
  id: "builtin.codex-cli",
  version: "0.1.1",
  interfaceVersion: "1.0.0",
  displayName: "OpenAI Codex CLI",
  sourceAgent: "codex-cli",
  defaultRootSegments: {
    posix: [".codex", "sessions"],
    windows: [".codex", "sessions"]
  }
} as const;

interface CodexCandidateMeta {
  path: string;
  id: string;
  parentThreadId?: string | undefined;
  forkedFromId?: string | undefined;
  title?: string | undefined;
  workspace?: string | undefined;
  version?: string | undefined;
  startedAt?: string | undefined;
  turnCountEstimate: number;
}

async function readCandidateMeta(source: VirtualSource, relativePath: string): Promise<CodexCandidateMeta> {
  const lines = parseJsonLines(relativePath, await source.readText(relativePath));
  const metaLine = lines.find(({ value }) => value?.type === "session_meta");
  const payload = asRecord(metaLine?.value?.payload) ?? {};
  const id = asString(payload.id) ?? asString(payload.session_id) ?? relativePath.replace(/^.*rollout-/u, "").replace(/\.jsonl$/u, "");
  let title: string | undefined;
  for (const line of lines.slice(0, 120)) {
    const record = line.value;
    const item = asRecord(record?.payload);
    if (record?.type === "event_msg" && item?.type === "user_message") {
      title = firstText(item.message)?.slice(0, 120);
      break;
    }
  }
  const turnCountEstimate = lines.filter(({ value: record }) => {
    const item = asRecord(record?.payload);
    return record?.type === "event_msg" && item?.type === "user_message";
  }).length;
  return {
    path: relativePath,
    id,
    turnCountEstimate,
    ...(asString(payload.parent_thread_id) ? { parentThreadId: asString(payload.parent_thread_id) } : {}),
    ...(asString(payload.forked_from_id) ? { forkedFromId: asString(payload.forked_from_id) } : {}),
    ...(title ? { title } : {}),
    ...(asString(payload.cwd) ? { workspace: asString(payload.cwd) } : {}),
    ...(asString(payload.cli_version) ? { version: asString(payload.cli_version) } : {}),
    ...(normalizeTimestamp(payload.timestamp ?? metaLine?.value?.timestamp)
      ? { startedAt: normalizeTimestamp(payload.timestamp ?? metaLine?.value?.timestamp) }
      : {})
  };
}

async function discover(source: VirtualSource): Promise<DiscoveredJourney[]> {
  const entries = await source.list();
  const files = entries
    .map(({ path }) => path.replaceAll("\\", "/"))
    .filter((filePath) => filePath.endsWith(".jsonl"));
  const metas = await Promise.all(files.map((filePath) => readCandidateMeta(source, filePath)));
  const byParent = new Map<string, CodexCandidateMeta[]>();
  for (const meta of metas) {
    if (!meta.parentThreadId) continue;
    const children = byParent.get(meta.parentThreadId) ?? [];
    children.push(meta);
    byParent.set(meta.parentThreadId, children);
  }

  const collectChildren = (id: string, seen = new Set<string>()): CodexCandidateMeta[] => {
    if (seen.has(id)) return [];
    seen.add(id);
    const direct = byParent.get(id) ?? [];
    return direct.flatMap((child) => [child, ...collectChildren(child.id, seen)]);
  };

  return metas
    .filter((meta) => !meta.parentThreadId || !metas.some(({ id }) => id === meta.parentThreadId))
    .map((meta) => {
      const children = collectChildren(meta.id);
      return {
        sourceAgent: manifest.sourceAgent,
        nativeSessionId: meta.id,
        relativePaths: [meta.path, ...children.map(({ path }) => path)].sort(),
        ...(meta.title ? { title: meta.title } : {}),
        ...(meta.workspace ? { workspace: meta.workspace } : {}),
        ...(meta.version ? { sourceAgentVersion: meta.version } : {}),
        ...(meta.startedAt ? { startedAt: meta.startedAt } : {}),
        turnCountEstimate: meta.turnCountEstimate + children.reduce(
          (total, child) => total + child.turnCountEstimate,
          0
        ),
        locator: {
          mainPath: meta.path,
          ...(meta.forkedFromId ? { parentNativeSessionId: meta.forkedFromId } : {})
        }
      };
    })
    .sort((left, right) => (right.startedAt ?? "").localeCompare(left.startedAt ?? ""));
}

function itemText(item: Record<string, unknown>): string {
  return firstText(item.message ?? item.content ?? item.summary ?? item.text) ?? "";
}

function parseCodexFile(
  relativePath: string,
  fileIndex: number,
  threadId: string,
  bundle: SourceBundleView,
  builder: InterpretationBuilder,
  metadata: Record<string, string | undefined>,
  toolCalls: Map<string, string>,
  deliveryActivities: Map<string, string>
): void {
  if (threadId !== "main") builder.addThread({ id: threadId, parentThreadId: "main", label: threadId });
  const sourceText = bundle.readText(relativePath);
  const lines = parseJsonLines(relativePath, sourceText);
  assertNoTrailingPartialJson(sourceText, lines);
  const projectedHumanText = new Set(
    lines.flatMap(({ value }) => {
      const item = asRecord(value?.payload);
      return value?.type === "event_msg" && item?.type === "user_message" ? [itemText(item)] : [];
    }).filter(Boolean)
  );
  const projectedAgentText = new Set(
    lines.flatMap(({ value }) => {
      const item = asRecord(value?.payload);
      return value?.type === "event_msg" && item?.type === "agent_message" ? [itemText(item)] : [];
    }).filter(Boolean)
  );

  for (const line of lines) {
    if (!line.value) {
      builder.malformed(line);
      continue;
    }
    const record = line.value;
    const recordType = asString(record.type) ?? "unknown";
    const payload = asRecord(record.payload) ?? {};
    const payloadType = asString(payload.type) ?? "unknown";
    const timestamp = normalizeTimestamp(record.timestamp ?? payload.timestamp ?? payload.occurred_at);
    const sourceBase = fileIndex * 1_000_000 + line.line * 1000;
    const activityIds: string[] = [];
    const evidencedTurnId = asString(payload.turn_id);
    if (evidencedTurnId) builder.setCurrentTurn(threadId, evidencedTurnId);

    if (recordType === "session_meta") {
      metadata.nativeSessionId ??= asString(payload.id) ?? asString(payload.session_id);
      metadata.workspace ??= asString(payload.cwd);
      metadata.sourceAgentVersion ??= asString(payload.cli_version);
      metadata.modelProvider ??= asString(payload.model_provider);
      metadata.startedAt ??= normalizeTimestamp(payload.timestamp ?? record.timestamp);
      metadata.gitBranch ??= asString(asRecord(payload.git)?.branch);
      builder.disposition(line.anchor, "metadata");
      continue;
    }

    if (recordType === "event_msg") {
      if (payloadType === "agent_message_delta" || payloadType === "reasoning_content_delta") {
        const kind = payloadType === "agent_message_delta" ? "agent-output" as const : "reasoning" as const;
        const key = `${threadId}:${kind}`;
        let activityId = deliveryActivities.get(key);
        if (!activityId) {
          activityId = builder.addActivity({
            kind,
            anchor: `${line.anchor}/stream`,
            sourceOrder: sourceBase,
            threadId,
            timestamp,
            actor: "agent",
            text: ""
          });
          deliveryActivities.set(key, activityId);
        }
        builder.appendDeliveryChunk(activityId, textFrom(payload.delta ?? payload.message ?? payload.text), timestamp);
        activityIds.push(activityId);
      } else if (payloadType === "user_message") {
        const text = itemText(payload);
        if (text) {
          activityIds.push(
            builder.addActivity({
              kind: "human-input",
              anchor: line.anchor,
              sourceOrder: sourceBase,
              threadId,
              timestamp,
              actor: "human",
              text,
              payload: jsonValue(payload)
            })
          );
          metadata.title ??= text.slice(0, 120);
        }
      } else if (payloadType === "agent_message") {
        const text = itemText(payload);
        const streamedId = deliveryActivities.get(`${threadId}:agent-output`);
        if (text && streamedId) {
          builder.setActivityText(streamedId, text);
          activityIds.push(streamedId);
          deliveryActivities.delete(`${threadId}:agent-output`);
        } else if (text) {
          activityIds.push(
            builder.addActivity({
              kind: "agent-output",
              anchor: line.anchor,
              sourceOrder: sourceBase,
              threadId,
              timestamp,
              actor: "agent",
              text,
              payload: jsonValue(payload)
            })
          );
        }
      } else if (payloadType === "token_count") {
        activityIds.push(
          builder.addActivity({
            kind: "usage-observation",
            anchor: line.anchor,
            sourceOrder: sourceBase,
            threadId,
            timestamp,
            actor: "system",
            payload: jsonValue(payload)
          })
        );
      } else if (payloadType === "patch_apply_end") {
        const callId = asString(payload.call_id);
        const targetActivityId = callId ? toolCalls.get(callId) : undefined;
        activityIds.push(
          builder.addActivity({
            kind: "tool-result",
            anchor: line.anchor,
            sourceOrder: sourceBase,
            threadId,
            timestamp,
            actor: "tool",
            nativeName: "apply_patch",
            status: statusFrom(payload.success),
            text: textFrom(payload.stdout ?? payload.stderr),
            payload: jsonValue(payload),
            ...(targetActivityId ? { links: [{ relation: "result-of", targetActivityId }] } : {})
          })
        );
      } else if (payloadType === "sub_agent_activity") {
        const agentThreadId = asString(payload.agent_thread_id);
        if (agentThreadId) builder.addThread({ id: `agent:${agentThreadId}`, parentThreadId: threadId, label: asString(payload.agent_path) ?? agentThreadId });
        activityIds.push(
          builder.addActivity({
            kind: "state-transition",
            anchor: line.anchor,
            sourceOrder: sourceBase,
            threadId,
            timestamp,
            actor: "system",
            nativeName: "sub-agent-activity",
            payload: jsonValue(payload)
          })
        );
      } else if (["task_started", "task_complete", "turn_started", "turn_aborted", "thread_settings_applied", "context_compacted"].includes(payloadType)) {
        activityIds.push(
          builder.addActivity({
            kind: "state-transition",
            anchor: line.anchor,
            sourceOrder: sourceBase,
            threadId,
            timestamp,
            actor: "system",
            nativeName: payloadType,
            status: payloadType.includes("aborted") ? "cancelled" : "unknown",
            payload: jsonValue(payload)
          })
        );
      } else {
        builder.unclassified(line, `unknown Codex event message: ${payloadType}`);
        continue;
      }
    } else if (recordType === "response_item") {
      if (payloadType === "reasoning") {
        const text = itemText(payload);
        const streamedId = deliveryActivities.get(`${threadId}:reasoning`);
        if (streamedId) {
          builder.setActivityText(streamedId, text);
          activityIds.push(streamedId);
          deliveryActivities.delete(`${threadId}:reasoning`);
        } else activityIds.push(
          builder.addActivity({
            kind: "reasoning",
            anchor: line.anchor,
            sourceOrder: sourceBase,
            threadId,
            timestamp,
            actor: "agent",
            text,
            payload: jsonValue(payload)
          })
        );
      } else if (["function_call", "custom_tool_call", "local_shell_call", "web_search_call"].includes(payloadType)) {
        const nativeName = asString(payload.name) ?? payloadType;
        const activityId = builder.addActivity({
          kind: "tool-invocation",
          anchor: line.anchor,
          sourceOrder: sourceBase,
          threadId,
          timestamp,
          actor: "agent",
          nativeName,
          toolCapabilities: toolCapabilities(nativeName),
          status: statusFrom(payload.status),
          payload: jsonValue(payload.arguments ?? payload.input ?? payload)
        });
        const callId = asString(payload.call_id) ?? asString(payload.id);
        if (callId) toolCalls.set(callId, activityId);
        activityIds.push(activityId);
      } else if (["function_call_output", "custom_tool_call_output", "local_shell_call_output", "web_search_call_output"].includes(payloadType)) {
        const callId = asString(payload.call_id);
        const targetActivityId = callId ? toolCalls.get(callId) : undefined;
        activityIds.push(
          builder.addActivity({
            kind: "tool-result",
            anchor: line.anchor,
            sourceOrder: sourceBase,
            threadId,
            timestamp,
            actor: "tool",
            status: "unknown",
            text: textFrom(payload.output),
            payload: jsonValue(payload),
            ...(targetActivityId ? { links: [{ relation: "result-of", targetActivityId }] } : {})
          })
        );
      } else if (payloadType === "message") {
        const role = asString(payload.role) ?? "unknown";
        const text = itemText(payload);
        const projected = role === "user" ? projectedHumanText.has(text) : role === "assistant" ? projectedAgentText.has(text) : false;
        if (projected) {
          builder.disposition(line.anchor, "duplicate", [], `response_item ${role} message is represented by event_msg projection`);
          continue;
        }
        const injected = role === "developer" || role === "system" || (role === "user" && /(?:AGENTS\.md|<environment_context>|<INSTRUCTIONS>)/iu.test(text));
        if (role === "assistant" || role === "user" || injected) {
          const kind = role === "assistant" ? "agent-output" : injected ? "context-injection" : "human-input";
          activityIds.push(
            builder.addActivity({
              kind,
              anchor: line.anchor,
              sourceOrder: sourceBase,
              threadId,
              timestamp,
              actor: role === "assistant" ? "agent" : injected ? "system" : "human",
              text,
              payload: jsonValue(payload)
            })
          );
          if (kind === "human-input") metadata.title ??= text.slice(0, 120);
        } else {
          builder.unclassified(line, `unknown Codex message role: ${role}`);
          continue;
        }
      } else if (payloadType === "agent_message") {
        const text = itemText(payload);
        activityIds.push(
          builder.addActivity({
            kind: "agent-output",
            anchor: line.anchor,
            sourceOrder: sourceBase,
            threadId,
            timestamp,
            actor: "agent",
            text,
            payload: jsonValue(payload)
          })
        );
      } else {
        builder.unclassified(line, `unknown Codex response item: ${payloadType}`);
        continue;
      }
    } else if (recordType === "turn_context") {
      const model = asString(payload.model);
      if (model) builder.models.add(model);
      activityIds.push(
        builder.addActivity({
          kind: "state-transition",
          anchor: line.anchor,
          sourceOrder: sourceBase,
          threadId,
          timestamp,
          actor: "system",
          nativeName: "turn-context",
          payload: jsonValue(payload)
        })
      );
    } else if (recordType === "compacted") {
      activityIds.push(
        builder.addActivity({
          kind: "state-transition",
          anchor: line.anchor,
          sourceOrder: sourceBase,
          threadId,
          timestamp,
          actor: "system",
          nativeName: "compaction",
          payload: jsonValue(record)
        })
      );
    } else if (recordType === "world_state") {
      builder.disposition(line.anchor, "metadata", [], "world state retained in Source Evidence");
      continue;
    } else if (recordType === "inter_agent_communication_metadata") {
      activityIds.push(
        builder.addActivity({
          kind: "state-transition",
          anchor: line.anchor,
          sourceOrder: sourceBase,
          threadId,
          timestamp,
          actor: "system",
          nativeName: "inter-agent-communication",
          payload: jsonValue(record)
        })
      );
    } else {
      builder.unclassified(line, `unknown Codex record type: ${recordType}`);
      continue;
    }

    if (activityIds.length > 0) builder.disposition(line.anchor, "canonical", activityIds);
    else builder.disposition(line.anchor, "transport", [], `${recordType}/${payloadType} contained no renderable content`);
    if (recordType === "event_msg" && ["task_complete", "turn_aborted"].includes(payloadType)) {
      builder.setCurrentTurn(threadId, undefined);
    }
  }
}

async function interpret(candidate: DiscoveredJourney, bundle: SourceBundleView) {
  const builder = new InterpretationBuilder();
  const metadata: Record<string, string | undefined> = {
    nativeSessionId: candidate.nativeSessionId,
    title: candidate.title,
    workspace: candidate.workspace,
    sourceAgentVersion: candidate.sourceAgentVersion,
    startedAt: candidate.startedAt,
    parentNativeSessionId: asString(candidate.locator.parentNativeSessionId)
  };
  const toolCalls = new Map<string, string>();
  const deliveryActivities = new Map<string, string>();
  const mainPath = asString(candidate.locator.mainPath) ?? candidate.relativePaths[0];
  if (!mainPath) throw new Error("Codex candidate has no rollout file");

  for (const [fileIndex, relativePath] of candidate.relativePaths.entries()) {
    const metaLine = parseJsonLines(relativePath, bundle.readText(relativePath)).find(({ value }) => value?.type === "session_meta");
    const childId = asString(asRecord(metaLine?.value?.payload)?.id) ?? asString(asRecord(metaLine?.value?.payload)?.session_id);
    const threadId = relativePath === mainPath ? "main" : `agent:${childId ?? fileIndex}`;
    parseCodexFile(relativePath, fileIndex, threadId, bundle, builder, metadata, toolCalls, deliveryActivities);
  }

  return builder.build({
    adapterId: manifest.id,
    adapterVersion: manifest.version,
    sourceAgent: manifest.sourceAgent,
    nativeSessionId: metadata.nativeSessionId ?? candidate.nativeSessionId,
    ...(metadata.parentNativeSessionId ? { parentNativeSessionId: metadata.parentNativeSessionId } : {}),
    ...(metadata.title ? { title: metadata.title } : {}),
    ...(metadata.workspace ? { workspace: metadata.workspace } : {}),
    ...(metadata.gitBranch ? { gitBranch: metadata.gitBranch } : {}),
    ...(metadata.sourceAgentVersion ? { sourceAgentVersion: metadata.sourceAgentVersion } : {}),
    ...(metadata.modelProvider ? { modelProvider: metadata.modelProvider } : {}),
    ...(metadata.startedAt ? { startedAt: metadata.startedAt } : {})
  });
}

export const codexCliAdapter: SourceAdapterPlugin = { manifest, discover, interpret };
