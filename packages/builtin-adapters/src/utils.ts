import type {
  ActivityDocument,
  ActivityKind,
  AgentThreadDocument,
  EvidenceDispositionDocument,
  InterpretationDocument,
  JsonValue
} from "@agentjourney/contracts";
import { MAIN_THREAD_ID } from "@agentjourney/plugin-sdk";

export interface JsonLine {
  line: number;
  anchor: string;
  value?: Record<string, unknown>;
  error?: string;
}

export function parseJsonLines(relativePath: string, text: string): JsonLine[] {
  return text
    .split(/\r?\n/u)
    .map((raw, index) => ({ raw, line: index + 1 }))
    .filter(({ raw }) => raw.trim().length > 0)
    .map(({ raw, line }) => {
      const anchor = `${relativePath}#L${line}`;
      try {
        const value: unknown = JSON.parse(raw);
        if (!isRecord(value)) return { line, anchor, error: "JSON value is not an object" };
        return { line, anchor, value };
      } catch (error) {
        return { line, anchor, error: error instanceof Error ? error.message : "invalid JSON" };
      }
    });
}

export function assertNoTrailingPartialJson(text: string, lines: readonly JsonLine[]): void {
  const last = lines.at(-1);
  if (last?.error && !text.endsWith("\n") && !text.endsWith("\r")) {
    throw new Error(`Source file appears to end with an incomplete JSON record at ${last.anchor}`);
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

export function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function jsonValue(value: unknown): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (Array.isArray(value)) return value.map(jsonValue);
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, jsonValue(child)]));
  }
  return String(value);
}

export function textFrom(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === "string") return entry;
        const item = asRecord(entry);
        return item ? asString(item.text) ?? asString(item.content) ?? "" : "";
      })
      .filter(Boolean)
      .join("\n");
  }
  const record = asRecord(value);
  if (!record) return "";
  return asString(record.text) ?? asString(record.content) ?? asString(record.message) ?? "";
}

export function normalizeTimestamp(value: unknown): string | undefined {
  const candidate = asString(value);
  if (!candidate) return undefined;
  const parsed = new Date(candidate);
  return Number.isNaN(parsed.valueOf()) ? undefined : parsed.toISOString();
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function stableActivityId(anchor: string, kind: ActivityKind): string {
  return `act_${fnv1a(`${anchor}\0${kind}`)}`;
}

export function toolCapabilities(name: string): ActivityDocument["toolCapabilities"] {
  const lower = name.toLowerCase();
  const capabilities: NonNullable<ActivityDocument["toolCapabilities"]> = [];
  if (/bash|shell|terminal|command|exec/u.test(lower)) capabilities.push("shell");
  if (/read|cat|view|open_file/u.test(lower)) capabilities.push("file-read");
  if (/edit|write|patch|create|replace|notebook/u.test(lower)) capabilities.push("file-edit");
  if (/search|grep|glob|find|list/u.test(lower)) capabilities.push("search");
  if (/web|fetch|http|browser/u.test(lower)) capabilities.push("web");
  if (/agent|task|delegate|spawn/u.test(lower)) capabilities.push("delegation");
  if (/ask|confirm|prompt|question/u.test(lower)) capabilities.push("interaction");
  return [...new Set(capabilities)];
}

export interface ActivityInput {
  kind: ActivityKind;
  anchor: string;
  sourceOrder: number;
  threadId?: string | undefined;
  turnId?: string | undefined;
  timestamp?: string | undefined;
  actor?: ActivityDocument["actor"] | undefined;
  text?: string | undefined;
  nativeName?: string | undefined;
  toolCapabilities?: ActivityDocument["toolCapabilities"] | undefined;
  status?: ActivityDocument["status"] | undefined;
  payload?: JsonValue | undefined;
  links?: ActivityDocument["links"] | undefined;
  sourceExtensions?: ActivityDocument["sourceExtensions"] | undefined;
}

export class InterpretationBuilder {
  readonly activities: ActivityDocument[] = [];
  readonly dispositions: EvidenceDispositionDocument[] = [];
  readonly threads: AgentThreadDocument[] = [{ id: MAIN_THREAD_ID }];
  readonly models = new Set<string>();
  readonly missing = new Set<string>();
  private readonly currentTurns = new Map<string, string>();

  setCurrentTurn(threadId: string, turnId: string | undefined): void {
    if (turnId) this.currentTurns.set(threadId, turnId);
    else this.currentTurns.delete(threadId);
  }

  addActivity(input: ActivityInput): string {
    const id = stableActivityId(input.anchor, input.kind);
    const threadId = input.threadId ?? MAIN_THREAD_ID;
    const turnId = input.turnId ?? this.currentTurns.get(threadId);
    const activity: ActivityDocument = {
      id,
      kind: input.kind,
      evidenceAnchor: input.anchor,
      threadId,
      sourceOrder: input.sourceOrder,
      ...(turnId ? { turnId } : {}),
      ...(input.timestamp ? { timestamp: input.timestamp } : {}),
      ...(input.actor ? { actor: input.actor } : {}),
      ...(input.text !== undefined ? { text: input.text } : {}),
      ...(input.nativeName ? { nativeName: input.nativeName } : {}),
      ...(input.toolCapabilities ? { toolCapabilities: input.toolCapabilities } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.payload !== undefined ? { payload: input.payload } : {}),
      ...(input.links ? { links: input.links } : {}),
      ...(input.sourceExtensions ? { sourceExtensions: input.sourceExtensions } : {})
    };
    this.activities.push(activity);
    return id;
  }

  disposition(
    evidenceAnchor: string,
    disposition: EvidenceDispositionDocument["disposition"],
    activityIds: string[] = [],
    detail?: string
  ): void {
    this.dispositions.push({
      evidenceAnchor,
      disposition,
      ...(activityIds.length > 0 ? { activityIds } : {}),
      ...(detail ? { detail } : {})
    });
  }

  malformed(line: JsonLine): void {
    this.disposition(line.anchor, "malformed", [], line.error ?? "malformed record");
  }

  unclassified(line: JsonLine, detail: string): void {
    const id = this.addActivity({
      kind: "unclassified",
      anchor: line.anchor,
      sourceOrder: line.line * 1000,
      payload: jsonValue(line.value ?? { error: line.error ?? "unknown" })
    });
    this.disposition(line.anchor, "unclassified", [id], detail);
  }

  addLinks(activityIds: readonly string[], links: NonNullable<ActivityDocument["links"]>): void {
    for (const activityId of activityIds) {
      const activity = this.activities.find(({ id }) => id === activityId);
      if (!activity) continue;
      activity.links = [...(activity.links ?? []), ...links].filter(
        (link, index, values) => values.findIndex((candidate) => candidate.relation === link.relation && candidate.targetActivityId === link.targetActivityId) === index
      );
    }
  }

  appendDeliveryChunk(activityId: string, text: string, timestamp?: string): void {
    const activity = this.activities.find(({ id }) => id === activityId);
    if (!activity) throw new Error(`Unknown delivery Activity: ${activityId}`);
    const deliveryTrace = activity.deliveryTrace ?? [];
    deliveryTrace.push({
      sequence: deliveryTrace.length,
      text,
      ...(timestamp ? { timestamp } : {})
    });
    activity.deliveryTrace = deliveryTrace;
    activity.text = `${activity.text ?? ""}${text}`;
  }

  setActivityText(activityId: string, text: string): void {
    const activity = this.activities.find(({ id }) => id === activityId);
    if (!activity) throw new Error(`Unknown Activity: ${activityId}`);
    activity.text = text;
  }

  addThread(thread: AgentThreadDocument): void {
    if (!this.threads.some(({ id }) => id === thread.id)) this.threads.push(thread);
  }

  completeThread(threadId: string, returnActivityId: string): void {
    const thread = this.threads.find(({ id }) => id === threadId);
    if (thread) thread.returnActivityId = returnActivityId;
  }

  build(input: {
    adapterId: string;
    adapterVersion: string;
    sourceAgent: string;
    nativeSessionId: string;
    parentNativeSessionId?: string;
    title?: string;
    workspace?: string;
    gitBranch?: string;
    sourceAgentVersion?: string;
    modelProvider?: string;
    startedAt?: string;
    endedAt?: string;
    sourceExtensions?: Record<string, JsonValue>;
  }): InterpretationDocument {
    const contentKinds = [...new Set(this.activities.map(({ kind }) => kind))];
    const timedKinds = [
      ...new Set(this.activities.filter(({ timestamp }) => Boolean(timestamp)).map(({ kind }) => kind))
    ];
    const unclassified = this.dispositions.filter(({ disposition }) => disposition === "unclassified").length;
    const malformed = this.dispositions.filter(({ disposition }) => disposition === "malformed").length;
    const knownGaps = [
      ...(unclassified > 0 ? [`${unclassified} unclassified source record(s)`] : []),
      ...(malformed > 0 ? [`${malformed} malformed source record(s)`] : []),
      ...this.missing
    ];

    return {
      schemaVersion: "1.0.0",
      adapter: { id: input.adapterId, version: input.adapterVersion },
      journey: {
        sourceAgent: input.sourceAgent,
        nativeSessionId: input.nativeSessionId,
        ...(input.parentNativeSessionId ? { parentNativeSessionId: input.parentNativeSessionId } : {}),
        ...(input.title ? { title: input.title } : {}),
        ...(input.workspace ? { workspace: input.workspace } : {}),
        ...(input.gitBranch ? { gitBranch: input.gitBranch } : {}),
        ...(input.sourceAgentVersion ? { sourceAgentVersion: input.sourceAgentVersion } : {}),
        ...(input.modelProvider ? { modelProvider: input.modelProvider } : {}),
        ...(this.models.size > 0 ? { models: [...this.models] } : {}),
        ...(input.startedAt ? { startedAt: input.startedAt } : {}),
        ...(input.endedAt ? { endedAt: input.endedAt } : {})
      },
      activities: this.activities.sort((left, right) => left.sourceOrder - right.sourceOrder),
      threads: this.threads,
      coverage: {
        sourceRecordCount: this.dispositions.length,
        dispositions: this.dispositions,
        missing: [...this.missing]
      },
      fidelity: {
        contentKinds,
        timedKinds,
        deliveryTraces: this.activities.some(({ deliveryTrace }) => (deliveryTrace?.length ?? 0) > 0),
        agentThreads: this.threads.length > 1,
        causalLinks: this.activities.some(({ links }) => (links?.length ?? 0) > 0),
        terminalStream: false,
        knownGaps
      },
      ...(input.sourceExtensions ? { sourceExtensions: input.sourceExtensions } : {})
    };
  }
}

export function firstText(value: unknown): string | undefined {
  const text = textFrom(value).trim();
  return text.length > 0 ? text : undefined;
}

export function statusFrom(value: unknown): ActivityDocument["status"] {
  if (value === true || value === "success" || value === "completed") return "succeeded";
  if (value === false || value === "error" || value === "failed") return "failed";
  if (value === "running" || value === "in_progress") return "running";
  if (value === "cancelled" || value === "aborted") return "cancelled";
  return "unknown";
}
