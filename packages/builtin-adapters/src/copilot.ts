import { parse as parseYaml } from "yaml";
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
  statusFrom,
  textFrom,
  toolCapabilities
} from "./utils.js";

const manifest = {
  id: "builtin.github-copilot-cli",
  version: "0.2.0",
  interfaceVersion: "1.0.0",
  displayName: "GitHub Copilot CLI",
  sourceAgent: "github-copilot-cli",
  defaultRootSegments: {
    posix: [".copilot", "session-state"],
    windows: [".copilot", "session-state"]
  }
} as const;

async function discover(source: VirtualSource): Promise<DiscoveredJourney[]> {
  const entries = await source.list();
  const allPaths = entries.map(({ path }) => path.replaceAll("\\", "/"));
  const eventPaths = allPaths.filter((filePath) => /(^|\/)events\.jsonl$/u.test(filePath));
  const candidates: DiscoveredJourney[] = [];

  for (const eventsPath of eventPaths) {
    const directory = eventsPath === "events.jsonl" ? "" : eventsPath.slice(0, -"/events.jsonl".length);
    const lines = parseJsonLines(eventsPath, await source.readText(eventsPath));
    const startLine = lines.find(({ value }) => value?.type === "session.start");
    const start = asRecord(startLine?.value?.data) ?? {};
    const context = asRecord(start.context) ?? {};
    const nativeSessionId = asString(start.sessionId) ?? directory.split("/").at(-1);
    if (!nativeSessionId) continue;

    let title: string | undefined;
    for (const line of lines.slice(0, 120)) {
      if (line.value?.type !== "user.message") continue;
      title = firstText(asRecord(line.value.data)?.content)?.slice(0, 120);
      if (title) break;
    }

    let workspace = asString(context.cwd) ?? asString(context.workingDirectory);
    const workspacePath = directory ? `${directory}/workspace.yaml` : "workspace.yaml";
    if (!workspace && allPaths.includes(workspacePath)) {
      try {
        const yaml = asRecord(parseYaml(await source.readText(workspacePath)));
        workspace = asString(yaml?.cwd) ?? asString(yaml?.workspace);
      } catch {
        // The full file is still captured; interpretation reports malformed JSONL separately.
      }
    }

    const sourceAgentVersion = asString(start.copilotVersion);
    const startedAt = normalizeTimestamp(start.startTime ?? startLine?.value?.timestamp);
    candidates.push({
      sourceAgent: manifest.sourceAgent,
      nativeSessionId,
      relativePaths: allPaths.filter((filePath) => directory ? filePath.startsWith(`${directory}/`) : !filePath.includes("/")).sort(),
      ...(title ? { title } : {}),
      ...(workspace ? { workspace } : {}),
      ...(sourceAgentVersion ? { sourceAgentVersion } : {}),
      ...(startedAt ? { startedAt } : {}),
      locator: { directory, eventsPath }
    });
  }

  return candidates.sort((left, right) => (right.startedAt ?? "").localeCompare(left.startedAt ?? ""));
}

async function interpret(candidate: DiscoveredJourney, bundle: SourceBundleView) {
  const eventsPath = asString(candidate.locator.eventsPath) ?? candidate.relativePaths.find((filePath) => filePath.endsWith("events.jsonl"));
  if (!eventsPath) throw new Error("Copilot CLI candidate has no events.jsonl");

  const builder = new InterpretationBuilder();
  const sourceText = bundle.readText(eventsPath);
  const lines = parseJsonLines(eventsPath, sourceText);
  assertNoTrailingPartialJson(sourceText, lines);
  const toolCalls = new Map<string, string>();
  const approvalRequests = new Map<string, string>();
  const subagentThreads = new Map<string, string>();
  let workspace = candidate.workspace;
  let sourceAgentVersion = candidate.sourceAgentVersion;
  let startedAt = candidate.startedAt;
  let title = candidate.title;
  let modelProvider: string | undefined;
  let gitBranch: string | undefined;

  for (const line of lines) {
    if (!line.value) {
      builder.malformed(line);
      continue;
    }
    const record = line.value;
    const type = asString(record.type) ?? "unknown";
    const data = asRecord(record.data) ?? {};
    const timestamp = normalizeTimestamp(record.timestamp ?? data.timestamp ?? data.startTime ?? data.resumeTime);
    const sourceBase = line.line * 1000;
    const activityIds: string[] = [];
    const parentToolCallId = asString(data.parentToolCallId);
    const threadId = parentToolCallId ? subagentThreads.get(parentToolCallId) ?? "main" : "main";
    const evidencedTurnId = asString(data.turnId);
    if (type === "assistant.turn_start" && evidencedTurnId) builder.setCurrentTurn(threadId, evidencedTurnId);

    if (type === "session.start") {
      const context = asRecord(data.context) ?? {};
      workspace ??= asString(context.cwd) ?? asString(context.workingDirectory);
      gitBranch ??= asString(context.branch) ?? asString(context.gitBranch);
      sourceAgentVersion ??= asString(data.copilotVersion) ?? asString(data.version);
      startedAt ??= normalizeTimestamp(data.startTime ?? record.timestamp);
      builder.disposition(line.anchor, "metadata");
      continue;
    }

    if (type === "user.message" || type === "system.message") {
      const text = textFrom(data.content);
      activityIds.push(
        builder.addActivity({
          kind: type === "user.message" ? "human-input" : "context-injection",
          anchor: line.anchor,
          sourceOrder: sourceBase,
          threadId,
          timestamp,
          actor: type === "user.message" ? "human" : "system",
          text,
          payload: jsonValue(data)
        })
      );
      if (type === "user.message") title ??= text.slice(0, 120);
    } else if (type === "assistant.message") {
      const model = asString(data.model);
      if (model) builder.models.add(model);
      const reasoning = asString(data.reasoningText);
      if (reasoning) {
        activityIds.push(
          builder.addActivity({
            kind: "reasoning",
            anchor: `${line.anchor}/reasoningText`,
            sourceOrder: sourceBase,
            threadId,
            timestamp,
            actor: "agent",
            text: reasoning,
            payload: jsonValue({ opaque: Boolean(data.reasoningOpaque) })
          })
        );
      }
      const text = textFrom(data.content);
      if (text) {
        activityIds.push(
          builder.addActivity({
            kind: "agent-output",
            anchor: `${line.anchor}/content`,
            sourceOrder: sourceBase + 1,
            threadId,
            timestamp,
            actor: "agent",
            text,
            payload: jsonValue(data)
          })
        );
      }
    } else if (type === "tool.execution_start") {
      const nativeName = asString(data.toolName) ?? "unknown-tool";
      const activityId = builder.addActivity({
        kind: "tool-invocation",
        anchor: line.anchor,
        sourceOrder: sourceBase,
        threadId,
        timestamp,
        actor: "agent",
        nativeName,
        toolCapabilities: toolCapabilities(nativeName),
        status: "running",
        payload: jsonValue(data.arguments ?? data)
      });
      const callId = asString(data.toolCallId);
      if (callId) toolCalls.set(callId, activityId);
      activityIds.push(activityId);
    } else if (type === "tool.execution_complete") {
      const callId = asString(data.toolCallId);
      const targetActivityId = callId ? toolCalls.get(callId) : undefined;
      activityIds.push(
        builder.addActivity({
          kind: "tool-result",
          anchor: line.anchor,
          sourceOrder: sourceBase,
          threadId,
          timestamp,
          actor: "tool",
          status: statusFrom(data.success),
          text: textFrom(data.result ?? data.error),
          payload: jsonValue(data),
          ...(targetActivityId ? { links: [{ relation: "result-of", targetActivityId }] } : {})
        })
      );
    } else if (type === "permission.requested") {
      const approvalActivityId = builder.addActivity({
          kind: "approval-request",
          anchor: line.anchor,
          sourceOrder: sourceBase,
          threadId,
          timestamp,
          actor: "system",
          text: textFrom(data.promptRequest ?? data.permissionRequest),
          payload: jsonValue(data)
        });
      const requestId = asString(data.requestId);
      if (requestId) approvalRequests.set(requestId, approvalActivityId);
      activityIds.push(approvalActivityId);
    } else if (type === "permission.completed") {
      const requestId = asString(data.requestId);
      const requestActivityId = requestId ? approvalRequests.get(requestId) : undefined;
      activityIds.push(
        builder.addActivity({
          kind: "approval-decision",
          anchor: line.anchor,
          sourceOrder: sourceBase,
          threadId,
          timestamp,
          actor: "human",
          text: textFrom(data.result),
          payload: jsonValue(data),
          ...(requestActivityId ? { links: [{ relation: "result-of", targetActivityId: requestActivityId }] } : {})
        })
      );
    } else if (type === "subagent.started") {
      const callId = asString(data.toolCallId) ?? `line-${line.line}`;
      const nestedThreadId = `agent:${callId}`;
      subagentThreads.set(callId, nestedThreadId);
      const subagentModel = asString(data.model);
      const spawnActivityId = builder.addActivity({
        kind: "state-transition",
        anchor: line.anchor,
        sourceOrder: sourceBase,
        threadId,
        timestamp,
        actor: "system",
        nativeName: "subagent-started",
        payload: jsonValue(data)
      });
      builder.addThread({
        id: nestedThreadId,
        parentThreadId: threadId,
        spawnActivityId,
        label: asString(data.agentDisplayName) ?? asString(data.agentName) ?? "Subagent",
        ...(subagentModel ? { model: subagentModel } : {})
      });
      activityIds.push(spawnActivityId);
    } else if (type === "subagent.completed") {
      const returnActivityId = builder.addActivity({
        kind: "state-transition",
        anchor: line.anchor,
        sourceOrder: sourceBase,
        threadId,
        timestamp,
        actor: "system",
        nativeName: "subagent-completed",
        status: "succeeded",
        payload: jsonValue(data)
      });
      const callId = asString(data.toolCallId);
      if (callId) builder.completeThread(subagentThreads.get(callId) ?? `agent:${callId}`, returnActivityId);
      activityIds.push(returnActivityId);
    } else if (type === "skill.invoked") {
      activityIds.push(
        builder.addActivity({
          kind: "context-injection",
          anchor: line.anchor,
          sourceOrder: sourceBase,
          threadId,
          timestamp,
          actor: "system",
          nativeName: asString(data.name) ?? "skill",
          text: textFrom(data.content ?? data.description),
          payload: jsonValue(data)
        })
      );
    } else if (type === "session.task_complete") {
      activityIds.push(
        builder.addActivity({
          kind: "state-transition",
          anchor: line.anchor,
          sourceOrder: sourceBase,
          threadId,
          timestamp,
          actor: "system",
          nativeName: "task-complete",
          status: statusFrom(data.success),
          text: textFrom(data.summary),
          payload: jsonValue(data)
        })
      );
    } else if (type === "system.notification" || type === "session.error") {
      activityIds.push(
        builder.addActivity({
          kind: type === "session.error" ? "diagnostic" : "state-transition",
          anchor: line.anchor,
          sourceOrder: sourceBase,
          threadId,
          timestamp,
          actor: "system",
          nativeName: asString(data.kind) ?? asString(data.errorType) ?? type,
          text: textFrom(data.content ?? data.message),
          status: type === "session.error" ? "failed" : "unknown",
          payload: jsonValue(data)
        })
      );
    } else if (type === "session.workspace_file_changed") {
      activityIds.push(
        builder.addActivity({
          kind: "artifact",
          anchor: line.anchor,
          sourceOrder: sourceBase,
          threadId,
          timestamp,
          actor: "system",
          nativeName: asString(data.operation) ?? "workspace-file-changed",
          text: asString(data.path),
          payload: jsonValue(data)
        })
      );
    } else if (["tool.user_requested", "session.permissions_changed", "session.context_changed"].includes(type)) {
      if (type === "session.context_changed") {
        workspace = asString(data.cwd) ?? workspace;
        gitBranch = asString(data.branch) ?? gitBranch;
      }
      activityIds.push(
        builder.addActivity({
          kind: "state-transition",
          anchor: line.anchor,
          sourceOrder: sourceBase,
          threadId,
          timestamp,
          actor: type === "tool.user_requested" ? "human" : "system",
          nativeName: type,
          payload: jsonValue(data)
        })
      );
    } else if (type === "session.shutdown") {
      activityIds.push(
        builder.addActivity({
          kind: "usage-observation",
          anchor: `${line.anchor}/usage`,
          sourceOrder: sourceBase,
          threadId,
          timestamp,
          actor: "system",
          payload: jsonValue(data)
        }),
        builder.addActivity({
          kind: "state-transition",
          anchor: `${line.anchor}/shutdown`,
          sourceOrder: sourceBase + 1,
          threadId,
          timestamp,
          actor: "system",
          nativeName: "session-shutdown",
          status: "succeeded",
          payload: jsonValue({ shutdownType: data.shutdownType })
        })
      );
    } else if (type === "session.plan_changed") {
      activityIds.push(
        builder.addActivity({
          kind: "artifact",
          anchor: line.anchor,
          sourceOrder: sourceBase,
          threadId,
          timestamp,
          actor: "system",
          nativeName: "plan",
          payload: jsonValue(data)
        })
      );
    } else if (["session.model_change", "session.mode_changed", "session.compaction_start", "session.compaction_complete", "session.resume", "session.info", "assistant.turn_start", "assistant.turn_end", "abort"].includes(type)) {
      const model = asString(data.newModel) ?? asString(data.selectedModel);
      if (model) builder.models.add(model);
      const previousModel = asString(data.previousModel);
      const stateText = type === "session.model_change" && model
        ? `Model changed${previousModel ? ` from ${previousModel}` : ""} to ${model}`
        : undefined;
      activityIds.push(
        builder.addActivity({
          kind: type === "abort" ? "diagnostic" : "state-transition",
          anchor: line.anchor,
          sourceOrder: sourceBase,
          threadId,
          timestamp,
          actor: "system",
          nativeName: type,
          status: type === "abort" ? "cancelled" : "unknown",
          ...(stateText ? { text: stateText } : {}),
          payload: jsonValue(data)
        })
      );
    } else if (type === "hook.start" || type === "hook.end") {
      builder.disposition(line.anchor, "transport", [], `${type} retained as hook transport detail`);
      continue;
    } else {
      builder.unclassified(line, `unknown Copilot CLI event type: ${type}`);
      continue;
    }

    if (activityIds.length > 0) builder.disposition(line.anchor, "canonical", activityIds);
    else builder.disposition(line.anchor, "transport", [], `${type} contained no renderable content`);
    if (type === "assistant.turn_end") builder.setCurrentTurn(threadId, undefined);
  }

  return builder.build({
    adapterId: manifest.id,
    adapterVersion: manifest.version,
    sourceAgent: manifest.sourceAgent,
    nativeSessionId: candidate.nativeSessionId,
    ...(title ? { title } : {}),
    ...(workspace ? { workspace } : {}),
    ...(sourceAgentVersion ? { sourceAgentVersion } : {}),
    ...(gitBranch ? { gitBranch } : {}),
    ...(modelProvider ? { modelProvider } : {}),
    ...(startedAt ? { startedAt } : {})
  });
}

export const copilotCliAdapter: SourceAdapterPlugin = { manifest, discover, interpret };
