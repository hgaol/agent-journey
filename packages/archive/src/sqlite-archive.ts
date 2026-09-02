import { chmod, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type {
  ActivityDocument,
  ArchiveIssueDocument,
  ArchiveVerificationDocument,
  EvidenceSearchHitDocument,
  InterpretationDocument,
  InterpretationSummaryDocument,
  JsonValue,
  JourneyPackageManifestDocument,
  PendingEvidenceDocument,
  ProjectDocument,
  ReviewAnnotationDocument,
  ReviewOverlayDocument,
  RevisionSummaryDocument,
  SensitiveFindingDocument,
  StageDocument
} from "@agentjourney/contracts";
import {
  assertInterpretationDocument,
  assertJourneyPackageManifestDocument,
  assertStageDocument
} from "@agentjourney/contracts/validate";
import { deriveTurns, linearizeActivityGraph } from "@agentjourney/activity-graph";
import { ContentObjectStore } from "./object-store.js";
import { detectSensitiveFindings, maskSensitiveText, redactJsonValue } from "./redaction.js";
import { ARCHIVE_SCHEMA } from "./schema.js";
import { stableJson } from "./stable-json.js";
import type {
  ArchiveCapture,
  CaptureCommitResult,
  CaptureExclusion,
  JourneyArchive,
  JourneyDetail,
  JourneyPackageImportResult,
  JourneySelection,
  JourneySummary,
  PendingEvidenceBundle,
  PendingEvidenceInput,
  RetentionPolicy,
  ReviewAnnotationUpdate,
  ReviewOverlayUpdate,
  SearchHit,
  SearchOptions,
  SourceBundleFile
} from "./types.js";

function hash(parts: readonly (string | Uint8Array)[]): string {
  const digest = createHash("sha256");
  for (const part of parts) {
    digest.update(part);
    digest.update("\0");
  }
  return digest.digest("hex");
}

function normalizeRelativePath(input: string): string {
  const normalized = input.replaceAll("\\", "/").replace(/^\.\//u, "");
  if (!normalized || normalized.startsWith("/") || normalized.split("/").includes("..") || /^[a-zA-Z]:/u.test(normalized)) {
    throw new Error(`Source Bundle path must be portable and relative: ${input}`);
  }
  return normalized;
}

function nowIso(): string {
  return new Date().toISOString();
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return Number(value);
  return 0;
}

function parseStringArray(value: unknown): string[] {
  if (typeof value !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function ftsQuery(input: string): string {
  const terms: string[] = [];
  const pattern = /"([^"]+)"|(\S+)/gu;
  for (const match of input.trim().matchAll(pattern)) {
    const phrase = match[1];
    const raw = match[2];
    const prefix = Boolean(raw?.endsWith("*") && raw.length > 1);
    const value = phrase ?? (prefix ? raw!.slice(0, -1) : raw) ?? "";
    if (!value) continue;
    terms.push(`"${value.replaceAll('"', '""')}"${prefix ? "*" : ""}`);
  }
  return terms.join(" AND ");
}

function normalizeTags(tags: readonly string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))].slice(0, 100);
}

function textBytes(bytes: Uint8Array): string | undefined {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
}

interface PortableArchiveDocument {
  formatVersion: 1;
  journeys: Array<{
    id: string;
    sourceAgent: string;
    nativeSessionId: string;
    projectName?: string;
    overlay: ReviewOverlayDocument;
    revisions: Array<{
      id: string;
      capturedAt: string;
      currentInterpretationId: string;
      sourceProvenance?: RevisionSummaryDocument["sourceProvenance"];
      observations: Array<{
        observedAt: string;
        sourceProvenance: Record<string, JsonValue>;
        files: Array<{ relativePath: string; sha256: string; size: number }>;
      }>;
      sourceFiles: Array<{ relativePath: string; entry: string; sha256: string; size: number }>;
      interpretations: Array<{ id: string; provenance: "local" | "external"; document: InterpretationDocument }>;
    }>;
  }>;
}

function packageEntryPath(journeyId: string, revisionId: string, relativePath: string): string {
  const encoded = normalizeRelativePath(relativePath).split("/").map(encodeURIComponent).join("/");
  return `evidence/${journeyId}/${revisionId}/${encoded}`;
}

function validatePackageEntryPath(entry: string): void {
  if (!entry || entry.startsWith("/") || entry.split("/").includes("..") || entry.includes("\\")) {
    throw new Error(`Unsafe Journey Package entry: ${entry}`);
  }
}

function searchableActivityText(activity: ActivityDocument): string {
  return [
    activity.text ?? "",
    activity.payload === undefined ? "" : stableJson(activity.payload),
    activity.sourceExtensions ? stableJson(activity.sourceExtensions) : ""
  ].filter(Boolean).join("\n");
}

function redactActivity(activity: ActivityDocument): ActivityDocument {
  return {
    ...activity,
    ...(activity.text !== undefined ? { text: maskSensitiveText(activity.text) } : {}),
    ...(activity.payload !== undefined ? { payload: redactJsonValue(activity.payload) } : {}),
    ...(activity.sourceExtensions
      ? { sourceExtensions: Object.fromEntries(Object.entries(activity.sourceExtensions).map(([key, value]) => [key, redactJsonValue(value)])) }
      : {}),
    ...(activity.deliveryTrace
      ? { deliveryTrace: activity.deliveryTrace.map((chunk) => ({ ...chunk, text: maskSensitiveText(chunk.text) })) }
      : {})
  };
}

export class SqliteJourneyArchive implements JourneyArchive {
  private readonly database: DatabaseSync;
  private readonly objects: ContentObjectStore;
  private initialized = false;

  private constructor(private readonly root: string) {
    this.database = new DatabaseSync(path.join(root, "archive.sqlite"));
    this.objects = new ContentObjectStore(path.join(root, "objects", "sha256"));
  }

  static async open(root: string): Promise<SqliteJourneyArchive> {
    await mkdir(root, { recursive: true, mode: 0o700 });
    if (process.platform !== "win32") await chmod(root, 0o700);
    const archive = new SqliteJourneyArchive(root);
    await archive.objects.initialize();
    archive.database.exec(ARCHIVE_SCHEMA);
    archive.ensureColumn("journeys", "parent_native_session_id", "TEXT");
    archive.ensureColumn("journey_revisions", "provenance_json", "TEXT NOT NULL DEFAULT '{}'");
    archive.ensureColumn("journey_revisions", "identity_conflict", "INTEGER NOT NULL DEFAULT 0");
    archive.ensureColumn("revision_observations", "manifest_hash", "TEXT");
    archive.migrateSensitiveFindingScopes();
    if (process.platform !== "win32") await chmod(path.join(root, "archive.sqlite"), 0o600);
    archive.initialized = true;
    return archive;
  }

  async commitCapture(capture: ArchiveCapture): Promise<CaptureCommitResult> {
    this.assertOpen();
    assertInterpretationDocument(capture.interpretation);
    const files = this.normalizeBundle(capture.files);
    const storedFiles = await this.storeFiles(files);
    const manifest = storedFiles.map(({ relativePath, hash: objectHash, size }) => ({ relativePath, hash: objectHash, size }));
    const manifestBytes = new TextEncoder().encode(stableJson(manifest));
    const storedManifest = await this.objects.put(manifestBytes);

    const interpretation = capture.interpretation;
    const journeyId = hash(["journey", interpretation.journey.sourceAgent, interpretation.journey.nativeSessionId]);
    const sourceIdentityBytes = new TextEncoder().encode(stableJson(
      storedFiles.map(({ hash: objectHash, size }) => ({ hash: objectHash, size }))
        .sort((left, right) => left.hash.localeCompare(right.hash) || left.size - right.size)
    ));
    const sourceFingerprint = hash(["source-bundle", sourceIdentityBytes]);
    const revisionId = hash(["revision", journeyId, sourceFingerprint]);
    const interpretationJson = stableJson(interpretation);
    const interpretationId = hash([
      "interpretation",
      revisionId,
      interpretation.adapter.id,
      interpretation.adapter.version,
      interpretation.schemaVersion,
      interpretationJson
    ]);
    const capturedAt = capture.capturedAt ?? nowIso();
    const provenance = capture.interpretationProvenance ?? "local";

    const existingJourney = this.database.prepare("SELECT id, latest_revision_id FROM journeys WHERE id = ?").get(journeyId) as Record<string, unknown> | undefined;
    const existingRevision = this.database.prepare("SELECT id FROM journey_revisions WHERE id = ?").get(revisionId);
    const existingInterpretation = this.database.prepare("SELECT id FROM interpretations WHERE id = ?").get(interpretationId);
    const previousRevisionId = optionalString(existingJourney?.latest_revision_id);
    const identityConflict = Boolean(
      existingJourney && !existingRevision && previousRevisionId && !(await this.isCompatibleExtension(previousRevisionId, files, storedFiles))
    );

    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.recordStoredObjects(storedFiles, storedManifest, capturedAt);
      this.database.prepare(`
        INSERT INTO journeys(
          id, source_agent, native_session_id, title, workspace, source_agent_version,
          parent_native_session_id, started_at, created_at, updated_at, latest_revision_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          title = COALESCE(journeys.title, excluded.title),
          workspace = COALESCE(journeys.workspace, excluded.workspace),
          source_agent_version = COALESCE(excluded.source_agent_version, journeys.source_agent_version),
          parent_native_session_id = COALESCE(excluded.parent_native_session_id, journeys.parent_native_session_id),
          started_at = COALESCE(journeys.started_at, excluded.started_at),
          updated_at = MAX(journeys.updated_at, excluded.updated_at),
          latest_revision_id = excluded.latest_revision_id
      `).run(
        journeyId,
        interpretation.journey.sourceAgent,
        interpretation.journey.nativeSessionId,
        interpretation.journey.title ?? null,
        interpretation.journey.workspace ?? null,
        interpretation.journey.sourceAgentVersion ?? null,
        interpretation.journey.parentNativeSessionId ?? null,
        interpretation.journey.startedAt ?? null,
        capturedAt,
        capturedAt,
        revisionId
      );

      this.database.prepare(`
        INSERT INTO journey_revisions(id, journey_id, source_fingerprint, manifest_hash, captured_at, provenance_json, identity_conflict, current_interpretation_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          current_interpretation_id = excluded.current_interpretation_id,
          provenance_json = CASE WHEN journey_revisions.provenance_json = '{}' THEN excluded.provenance_json ELSE journey_revisions.provenance_json END,
          identity_conflict = MAX(journey_revisions.identity_conflict, excluded.identity_conflict)
      `).run(
        revisionId,
        journeyId,
        sourceFingerprint,
        storedManifest.hash,
        capturedAt,
        stableJson(capture.sourceProvenance ?? {}),
        identityConflict ? 1 : 0,
        interpretationId
      );

      const sourceProvenanceJson = stableJson(capture.sourceProvenance ?? {});
      this.database.prepare(`
        INSERT INTO revision_observations(id, revision_id, observed_at, provenance_json, manifest_hash)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO NOTHING
      `).run(
        hash(["observation", revisionId, sourceProvenanceJson, storedManifest.hash]),
        revisionId,
        capturedAt,
        sourceProvenanceJson,
        storedManifest.hash
      );

      const insertRevisionFile = this.database.prepare(`
        INSERT INTO revision_files(revision_id, relative_path, object_hash, byte_size)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(revision_id, relative_path) DO NOTHING
      `);
      for (const file of storedFiles) insertRevisionFile.run(revisionId, file.relativePath, file.hash, file.size);

      this.database.prepare(`
        INSERT INTO interpretations(
          id, revision_id, adapter_id, adapter_version, schema_version, provenance, document_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO NOTHING
      `).run(
        interpretationId,
        revisionId,
        interpretation.adapter.id,
        interpretation.adapter.version,
        interpretation.schemaVersion,
        provenance,
        interpretationJson,
        capturedAt
      );
      if (provenance === "local") {
        this.database.prepare("UPDATE interpretations SET provenance = 'local' WHERE id = ?").run(interpretationId);
      }
      this.database.prepare(`
        INSERT INTO interpretation_origins(interpretation_id, provenance, recorded_at) VALUES (?, ?, ?)
        ON CONFLICT(interpretation_id, provenance) DO NOTHING
      `).run(interpretationId, provenance, capturedAt);

      if (!existingInterpretation) {
        this.insertActivities(journeyId, revisionId, interpretationId, interpretation);
        this.insertSensitiveFindings(revisionId, interpretationId, files, interpretation);
      }
      this.database.prepare(`
        UPDATE journeys
        SET latest_revision_id = (
          SELECT id FROM journey_revisions
          WHERE journey_id = journeys.id
          ORDER BY captured_at DESC, id DESC
          LIMIT 1
        )
        WHERE id = ?
      `).run(journeyId);
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }

    return {
      journeyId,
      revisionId,
      interpretationId,
      newJourney: !existingJourney,
      newRevision: !existingRevision,
      newInterpretation: !existingInterpretation
    };
  }

  async listJourneys(): Promise<JourneySummary[]> {
    this.assertOpen();
    const rows = this.database.prepare(this.summarySql()).all();
    return rows.map((row) => this.summaryFromRow(row));
  }

  async getJourney(journeyId: string, selection: JourneySelection = {}): Promise<JourneyDetail | undefined> {
    this.assertOpen();
    const summary = (await this.listJourneys()).find(({ id }) => id === journeyId);
    if (!summary) return undefined;
    const revisionId = selection.revisionId ?? summary.latestRevisionId;
    const revision = this.database.prepare(`
      SELECT id, current_interpretation_id FROM journey_revisions WHERE id = ? AND journey_id = ?
    `).get(revisionId, journeyId) as Record<string, unknown> | undefined;
    if (!revision) return undefined;
    const interpretationId = selection.interpretationId ?? String(revision.current_interpretation_id);
    const interpretationRow = this.database.prepare(`
      SELECT document_json FROM interpretations WHERE id = ? AND revision_id = ?
    `).get(interpretationId, revisionId) as Record<string, unknown> | undefined;
    if (!interpretationRow) return undefined;
    const interpretation = JSON.parse(String(interpretationRow.document_json)) as InterpretationDocument;
    assertInterpretationDocument(interpretation);

    const sourceFiles = this.sourceFileRows(revisionId);
    const revisions = this.revisionRows(journeyId);
    const interpretations = this.interpretationRows(revisionId);
    const storedOverlay = this.overlayFor(journeyId);
    const resolvedAnchors = new Set(interpretation.activities.map(({ evidenceAnchor }) => evidenceAnchor));
    const overlay: ReviewOverlayDocument = {
      ...storedOverlay,
      annotations: storedOverlay.annotations.map((annotation) => ({
        ...annotation,
        resolved: resolvedAnchors.has(annotation.evidenceAnchor)
      }))
    };
    const findings = this.sensitiveFindingRows(revisionId, interpretationId);
    const redacted = selection.redacted ?? true;
    const orderedActivities = linearizeActivityGraph(interpretation.activities);
    const stageActivities = redacted ? orderedActivities.map(redactActivity) : orderedActivities;
    const annotations = overlay.annotations;
    const unclassified = interpretation.coverage.dispositions.filter(({ disposition }) => disposition === "unclassified").length;
    const malformed = interpretation.coverage.dispositions.filter(({ disposition }) => disposition === "malformed").length;
    const stage: StageDocument = {
      schemaVersion: "1.0.0",
      journeyId,
      revisionId,
      interpretationId,
      sourceAgent: interpretation.journey.sourceAgent,
      ...(interpretation.journey.sourceAgentVersion ? { sourceAgentVersion: interpretation.journey.sourceAgentVersion } : {}),
      ...(overlay.displayTitle ?? interpretation.journey.title
        ? { title: overlay.displayTitle ?? interpretation.journey.title }
        : {}),
      activities: stageActivities,
      threads: interpretation.threads,
      turns: deriveTurns(interpretation.activities),
      annotations,
      fidelity: interpretation.fidelity,
      sensitiveFindingCount: findings.length,
      coverageSummary: {
        sourceRecords: interpretation.coverage.sourceRecordCount,
        canonicalActivities: interpretation.activities.length,
        unclassified,
        malformed
      },
      presentation: { redacted, view: "review" }
    };
    assertStageDocument(stage);
    return {
      summary,
      revisionId,
      interpretationId,
      interpretation,
      stage,
      sourceFiles,
      revisions,
      interpretations,
      overlay,
      sensitiveFindings: findings
    };
  }

  async search(optionsOrQuery: SearchOptions | string, legacyLimit = 50): Promise<SearchHit[]> {
    this.assertOpen();
    const options: SearchOptions = typeof optionsOrQuery === "string"
      ? { query: optionsOrQuery, limit: legacyLimit }
      : optionsOrQuery;
    const match = options.query ? ftsQuery(options.query) : "";
    if (options.query && !match) return [];
    const conditions = ["j.latest_revision_id = f.revision_id", "r.current_interpretation_id = f.interpretation_id"];
    const values: Array<string | number> = [];
    if (match) {
      conditions.push("activity_fts MATCH ?");
      values.push(match);
    }
    if (options.sourceAgent) {
      conditions.push("j.source_agent = ?");
      values.push(options.sourceAgent);
    }
    if (options.kind) {
      conditions.push("a.kind = ?");
      values.push(options.kind);
    }
    if (options.capability) {
      conditions.push("(' ' || f.capabilities || ' ') LIKE ?");
      values.push(`% ${options.capability} %`);
    }
    if (options.projectId) {
      conditions.push("o.project_id = ?");
      values.push(options.projectId);
    }
    if (options.journeyId) {
      conditions.push("j.id = ?");
      values.push(options.journeyId);
    }
    if (options.from) {
      conditions.push("COALESCE(a.timestamp, j.started_at, j.updated_at) >= ?");
      values.push(options.from);
    }
    if (options.until) {
      conditions.push("COALESCE(a.timestamp, j.started_at, j.updated_at) <= ?");
      values.push(options.until);
    }
    const safeLimit = Math.max(1, Math.min(options.limit ?? 50, 200));
    values.push(safeLimit);
    let rows: unknown[];
    try {
      rows = this.database.prepare(`
        SELECT
          f.journey_id, f.revision_id, f.interpretation_id, f.activity_id,
          j.source_agent, COALESCE(o.display_title, j.title) AS title,
          a.kind, a.text_content, a.evidence_anchor
        FROM activity_fts f
        JOIN journeys j ON j.id = f.journey_id
        JOIN journey_revisions r ON r.id = f.revision_id
        JOIN activities a ON a.interpretation_id = f.interpretation_id AND a.activity_id = f.activity_id
        LEFT JOIN review_overlays o ON o.journey_id = j.id
        WHERE ${conditions.join(" AND ")}
        ${match ? "ORDER BY bm25(activity_fts)" : "ORDER BY COALESCE(a.timestamp, j.updated_at) DESC, a.source_order"}
        LIMIT ?
      `).all(...values);
    } catch {
      return [];
    }
    return rows.map((row) => {
      const value = row as Record<string, unknown>;
      const title = optionalString(value.title);
      return {
        journeyId: String(value.journey_id),
        revisionId: String(value.revision_id),
        interpretationId: String(value.interpretation_id),
        activityId: String(value.activity_id),
        sourceAgent: String(value.source_agent),
        ...(title ? { title } : {}),
        kind: String(value.kind),
        text: maskSensitiveText(String(value.text_content)),
        evidenceAnchor: String(value.evidence_anchor)
      };
    });
  }

  async readSourceFile(revisionId: string, relativePath: string, redacted = true): Promise<Uint8Array | undefined> {
    this.assertOpen();
    const normalized = normalizeRelativePath(relativePath);
    const row = this.database.prepare(`
      SELECT object_hash FROM revision_files WHERE revision_id = ? AND relative_path = ?
    `).get(revisionId, normalized) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    const bytes = await this.objects.get(String(row.object_hash));
    if (!redacted) return bytes;
    const text = textBytes(bytes);
    return text === undefined
      ? new TextEncoder().encode("[Binary Source Evidence is hidden while Presentation Redaction is enabled. Reveal explicitly to inspect raw bytes.]")
      : new TextEncoder().encode(maskSensitiveText(text));
  }

  async searchEvidence(revisionId: string, query: string, redacted = true): Promise<EvidenceSearchHitDocument[]> {
    this.assertOpen();
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return [];
    const hits: EvidenceSearchHitDocument[] = [];
    for (const file of this.sourceFileRows(revisionId)) {
      const bytes = await this.objects.get(file.hash);
      const text = textBytes(bytes);
      if (text === undefined) continue;
      const lines = text.split(/\r?\n/u);
      for (const [index, line] of lines.entries()) {
        let from = 0;
        const lower = line.toLocaleLowerCase();
        while (hits.length < 200) {
          const column = lower.indexOf(needle, from);
          if (column < 0) break;
          hits.push({
            relativePath: file.relativePath,
            line: index + 1,
            column: column + 1,
            text: redacted ? maskSensitiveText(line) : line,
            redacted
          });
          from = column + Math.max(1, needle.length);
        }
        if (hits.length >= 200) return hits;
      }
    }
    return hits;
  }

  async savePendingEvidence(input: PendingEvidenceInput): Promise<PendingEvidenceDocument> {
    this.assertOpen();
    const files = this.normalizeBundle(input.files);
    const storedFiles = await this.storeFiles(files);
    const createdAt = nowIso();
    const id = hash([
      "pending",
      input.sourceAgent,
      input.nativeSessionId,
      input.adapterId,
      input.adapterVersion,
      stableJson(storedFiles.map(({ relativePath, hash: objectHash, size }) => ({ relativePath, hash: objectHash, size })))
    ]);
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.recordStoredObjects(storedFiles, undefined, createdAt);
      this.database.prepare(`
        INSERT INTO pending_evidence(id, source_agent, native_session_id, adapter_id, adapter_version, candidate_json, error, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET error = excluded.error, candidate_json = excluded.candidate_json
      `).run(id, input.sourceAgent, input.nativeSessionId, input.adapterId, input.adapterVersion, stableJson(input.candidate), input.error, createdAt);
      const insert = this.database.prepare(`
        INSERT INTO pending_evidence_files(pending_id, relative_path, object_hash, byte_size) VALUES (?, ?, ?, ?)
        ON CONFLICT(pending_id, relative_path) DO NOTHING
      `);
      for (const file of storedFiles) insert.run(id, file.relativePath, file.hash, file.size);
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
    return {
      id,
      sourceAgent: input.sourceAgent,
      nativeSessionId: input.nativeSessionId,
      adapterId: input.adapterId,
      adapterVersion: input.adapterVersion,
      error: input.error,
      createdAt,
      fileCount: storedFiles.length
    };
  }

  async listPendingEvidence(): Promise<PendingEvidenceDocument[]> {
    this.assertOpen();
    return this.database.prepare(`
      SELECT p.*, COUNT(f.relative_path) AS file_count
      FROM pending_evidence p LEFT JOIN pending_evidence_files f ON f.pending_id = p.id
      GROUP BY p.id ORDER BY p.created_at DESC
    `).all().map((row) => this.pendingSummary(row));
  }

  async getPendingEvidence(id: string): Promise<PendingEvidenceBundle | undefined> {
    const row = this.database.prepare("SELECT * FROM pending_evidence WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    const fileRows = this.database.prepare(`
      SELECT relative_path, object_hash FROM pending_evidence_files WHERE pending_id = ? ORDER BY relative_path
    `).all(id) as Array<Record<string, unknown>>;
    const files: SourceBundleFile[] = [];
    for (const file of fileRows) {
      files.push({ relativePath: String(file.relative_path), bytes: await this.objects.get(String(file.object_hash)) });
    }
    return {
      summary: this.pendingSummary({ ...row, file_count: files.length }),
      candidate: JSON.parse(String(row.candidate_json)) as Record<string, unknown>,
      files
    };
  }

  async deletePendingEvidence(id: string): Promise<void> {
    this.database.prepare("DELETE FROM pending_evidence WHERE id = ?").run(id);
    await this.collectUnreferencedObjects();
  }

  async listProjects(): Promise<ProjectDocument[]> {
    return this.database.prepare(`
      SELECT p.id, p.name, p.created_at, p.updated_at, COUNT(o.journey_id) AS journey_count
      FROM projects p LEFT JOIN review_overlays o ON o.project_id = p.id
      GROUP BY p.id ORDER BY p.name COLLATE NOCASE
    `).all().map((row) => {
      const value = row as Record<string, unknown>;
      return {
        id: String(value.id),
        name: String(value.name),
        journeyCount: asNumber(value.journey_count),
        createdAt: String(value.created_at),
        updatedAt: String(value.updated_at)
      };
    });
  }

  async createProject(name: string): Promise<ProjectDocument> {
    const normalized = name.trim();
    if (!normalized) throw new Error("Project name is required");
    const existing = this.database.prepare("SELECT id FROM projects WHERE name = ? COLLATE NOCASE").get(normalized) as Record<string, unknown> | undefined;
    if (existing) {
      const projects = await this.listProjects();
      return projects.find(({ id }) => id === existing.id)!;
    }
    const id = randomUUID();
    const timestamp = nowIso();
    this.database.prepare("INSERT INTO projects(id, name, created_at, updated_at) VALUES (?, ?, ?, ?)").run(id, normalized, timestamp, timestamp);
    return { id, name: normalized, journeyCount: 0, createdAt: timestamp, updatedAt: timestamp };
  }

  async renameProject(id: string, name: string): Promise<ProjectDocument> {
    const normalized = name.trim();
    if (!normalized) throw new Error("Project name is required");
    const result = this.database.prepare("UPDATE projects SET name = ?, updated_at = ? WHERE id = ?")
      .run(normalized, nowIso(), id);
    if (asNumber(result.changes) === 0) throw new Error("Project does not exist");
    return (await this.listProjects()).find((project) => project.id === id)!;
  }

  async mergeProjects(sourceId: string, targetId: string): Promise<ProjectDocument> {
    if (sourceId === targetId) throw new Error("Projects must be different");
    if (!this.database.prepare("SELECT id FROM projects WHERE id = ?").get(sourceId)) throw new Error("Source Project does not exist");
    if (!this.database.prepare("SELECT id FROM projects WHERE id = ?").get(targetId)) throw new Error("Target Project does not exist");
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database.prepare("UPDATE review_overlays SET project_id = ?, updated_at = ? WHERE project_id = ?")
        .run(targetId, nowIso(), sourceId);
      this.database.prepare("DELETE FROM projects WHERE id = ?").run(sourceId);
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
    return (await this.listProjects()).find((project) => project.id === targetId)!;
  }

  async deleteProject(id: string): Promise<boolean> {
    const result = this.database.prepare("DELETE FROM projects WHERE id = ?").run(id);
    return asNumber(result.changes) > 0;
  }

  async updateReviewOverlay(journeyId: string, update: ReviewOverlayUpdate): Promise<ReviewOverlayDocument> {
    this.requireJourney(journeyId);
    const current = this.overlayFor(journeyId);
    const displayTitle = update.displayTitle === undefined ? current.displayTitle : update.displayTitle ?? undefined;
    const projectId = update.projectId === undefined ? current.projectId : update.projectId ?? undefined;
    const rendererId = update.rendererId === undefined ? current.rendererId : update.rendererId ?? undefined;
    const tags = update.tags === undefined ? current.tags : normalizeTags(update.tags);
    if (projectId && !this.database.prepare("SELECT id FROM projects WHERE id = ?").get(projectId)) {
      throw new Error("Project does not exist");
    }
    const updatedAt = nowIso();
    this.database.prepare(`
      INSERT INTO review_overlays(journey_id, display_title, project_id, renderer_id, tags_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(journey_id) DO UPDATE SET
        display_title = excluded.display_title,
        project_id = excluded.project_id,
        renderer_id = excluded.renderer_id,
        tags_json = excluded.tags_json,
        updated_at = excluded.updated_at
    `).run(journeyId, displayTitle ?? null, projectId ?? null, rendererId ?? null, JSON.stringify(tags), updatedAt);
    return this.overlayFor(journeyId);
  }

  async updateReviewAnnotation(
    journeyId: string,
    evidenceAnchor: string,
    update: ReviewAnnotationUpdate
  ): Promise<ReviewOverlayDocument> {
    this.requireJourney(journeyId);
    if (!evidenceAnchor) throw new Error("Evidence Anchor is required");
    const note = update.note?.trim() || undefined;
    if (!update.bookmarked && !note) {
      this.database.prepare("DELETE FROM review_annotations WHERE journey_id = ? AND evidence_anchor = ?").run(journeyId, evidenceAnchor);
    } else {
      this.database.prepare(`
        INSERT INTO review_annotations(journey_id, evidence_anchor, bookmarked, note, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(journey_id, evidence_anchor) DO UPDATE SET
          bookmarked = excluded.bookmarked,
          note = excluded.note,
          updated_at = excluded.updated_at
      `).run(journeyId, evidenceAnchor, update.bookmarked ? 1 : 0, note ?? null, nowIso());
    }
    return this.overlayFor(journeyId);
  }

  async verify(): Promise<ArchiveVerificationDocument> {
    const issues: ArchiveIssueDocument[] = [];
    if (process.platform !== "win32") {
      for (const candidate of [this.root, path.join(this.root, "archive.sqlite")]) {
        try {
          const mode = (await stat(candidate)).mode & 0o777;
          if ((mode & 0o077) !== 0) issues.push({ kind: "permission", message: `${candidate} is accessible beyond its owner (${mode.toString(8)})` });
        } catch {
          issues.push({ kind: "permission", message: `${candidate} permissions could not be verified` });
        }
      }
    }
    const objectRows = this.database.prepare("SELECT hash FROM archive_objects ORDER BY hash").all() as Array<Record<string, unknown>>;
    const trackedHashes = new Set(objectRows.map((row) => String(row.hash)));
    for (const physicalHash of await this.objects.listHashes()) {
      if (!trackedHashes.has(physicalHash)) {
        issues.push({ kind: "orphan-object", message: `Object ${physicalHash} is not tracked by archive metadata`, objectHash: physicalHash });
      }
    }
    for (const row of objectRows) {
      const objectHash = String(row.hash);
      try {
        const bytes = await this.objects.get(objectHash);
        const actual = createHash("sha256").update(bytes).digest("hex");
        if (actual !== objectHash) issues.push({ kind: "corrupt-object", message: `Object ${objectHash} does not match its hash`, objectHash });
      } catch {
        issues.push({ kind: "missing-object", message: `Object ${objectHash} is missing or unreadable`, objectHash });
      }
    }
    const orphanIndexRows = this.database.prepare(`
      SELECT COUNT(*) AS count FROM activity_fts f
      LEFT JOIN activities a ON a.interpretation_id = f.interpretation_id AND a.activity_id = f.activity_id
      WHERE a.activity_id IS NULL
    `).get() as Record<string, unknown>;
    const missingIndexRows = this.database.prepare(`
      SELECT COUNT(*) AS count FROM activities a
      LEFT JOIN activity_fts f ON f.interpretation_id = a.interpretation_id AND f.activity_id = a.activity_id
      WHERE f.activity_id IS NULL
    `).get() as Record<string, unknown>;
    if (asNumber(orphanIndexRows.count) > 0 || asNumber(missingIndexRows.count) > 0) {
      issues.push({
        kind: "orphan-index",
        message: `Search index mismatch: ${asNumber(orphanIndexRows.count)} orphaned and ${asNumber(missingIndexRows.count)} missing row(s)`
      });
    }
    const interpretationRows = this.database.prepare("SELECT id, document_json FROM interpretations").all() as Array<Record<string, unknown>>;
    for (const row of interpretationRows) {
      try {
        const value: unknown = JSON.parse(String(row.document_json));
        assertInterpretationDocument(value);
      } catch (error) {
        issues.push({ kind: "invalid-interpretation", message: `Interpretation ${String(row.id)}: ${error instanceof Error ? error.message : "invalid"}` });
      }
    }
    return { checkedObjects: objectRows.length, checkedInterpretations: interpretationRows.length, issues };
  }

  async repair(): Promise<ArchiveVerificationDocument> {
    await this.rebuildSearchIndex();
    await this.collectUnreferencedObjects();
    const tracked = new Set(
      (this.database.prepare("SELECT hash FROM archive_objects").all() as Array<Record<string, unknown>>)
        .map((row) => String(row.hash))
    );
    for (const physicalHash of await this.objects.listHashes()) {
      if (!tracked.has(physicalHash)) await this.objects.remove(physicalHash);
    }
    return this.verify();
  }

  async rebuildSearchIndex(): Promise<void> {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database.exec("DELETE FROM activity_fts");
      const insert = this.database.prepare(`
        INSERT INTO activity_fts(text_content, native_name, capabilities, activity_id, interpretation_id, journey_id, revision_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const rows = this.database.prepare("SELECT * FROM activities ORDER BY interpretation_id, source_order").all() as Array<Record<string, unknown>>;
      for (const row of rows) {
        const activity = JSON.parse(String(row.document_json)) as ActivityDocument;
        insert.run(
          searchableActivityText(activity),
          activity.nativeName ?? "",
          activity.toolCapabilities?.join(" ") ?? "",
          activity.id,
          String(row.interpretation_id),
          String(row.journey_id),
          String(row.revision_id)
        );
      }
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  async deleteJourney(journeyId: string, exclude: boolean): Promise<boolean> {
    const row = this.database.prepare("SELECT source_agent, native_session_id FROM journeys WHERE id = ?").get(journeyId) as Record<string, unknown> | undefined;
    if (!row) return false;
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database.prepare("DELETE FROM activity_fts WHERE journey_id = ?").run(journeyId);
      this.database.prepare("DELETE FROM journeys WHERE id = ?").run(journeyId);
      if (exclude) {
        this.database.prepare(`
          INSERT INTO capture_exclusions(source_agent, native_session_id, created_at) VALUES (?, ?, ?)
          ON CONFLICT(source_agent, native_session_id) DO NOTHING
        `).run(String(row.source_agent), String(row.native_session_id), nowIso());
      }
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
    await this.collectUnreferencedObjects();
    return true;
  }

  async listCaptureExclusions(): Promise<CaptureExclusion[]> {
    return this.database.prepare("SELECT * FROM capture_exclusions ORDER BY created_at DESC").all().map((row) => {
      const value = row as Record<string, unknown>;
      return { sourceAgent: String(value.source_agent), nativeSessionId: String(value.native_session_id), createdAt: String(value.created_at) };
    });
  }

  async removeCaptureExclusion(sourceAgent: string, nativeSessionId: string): Promise<void> {
    this.database.prepare("DELETE FROM capture_exclusions WHERE source_agent = ? AND native_session_id = ?").run(sourceAgent, nativeSessionId);
  }

  async isCaptureExcluded(sourceAgent: string, nativeSessionId: string): Promise<boolean> {
    return Boolean(this.database.prepare("SELECT 1 FROM capture_exclusions WHERE source_agent = ? AND native_session_id = ?").get(sourceAgent, nativeSessionId));
  }

  async getRetentionPolicy(): Promise<RetentionPolicy | undefined> {
    const row = this.database.prepare("SELECT * FROM retention_policies WHERE id = 'archive'").get() as Record<string, unknown> | undefined;
    return row ? this.retentionPolicyFromRow(row) : undefined;
  }

  async setRetentionPolicy(keepLastRevisions?: number): Promise<RetentionPolicy> {
    if (keepLastRevisions !== undefined && (!Number.isInteger(keepLastRevisions) || keepLastRevisions < 1)) {
      throw new Error("keepLastRevisions must be a positive integer");
    }
    const existing = await this.getRetentionPolicy();
    const timestamp = nowIso();
    this.database.prepare(`
      INSERT INTO retention_policies(id, scope, keep_last_revisions, created_at, updated_at)
      VALUES ('archive', 'archive', ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET keep_last_revisions = excluded.keep_last_revisions, updated_at = excluded.updated_at
    `).run(keepLastRevisions ?? null, existing?.createdAt ?? timestamp, timestamp);
    return (await this.getRetentionPolicy())!;
  }

  async applyRetentionPolicy(): Promise<{ deletedRevisions: number }> {
    const policy = await this.getRetentionPolicy();
    if (!policy?.keepLastRevisions) return { deletedRevisions: 0 };
    let deletedRevisions = 0;
    const journeyRows = this.database.prepare("SELECT id FROM journeys").all() as Array<Record<string, unknown>>;
    this.database.exec("BEGIN IMMEDIATE");
    try {
      for (const journey of journeyRows) {
        const revisions = this.database.prepare(`
          SELECT id FROM journey_revisions WHERE journey_id = ? ORDER BY captured_at DESC, id DESC
        `).all(String(journey.id)) as Array<Record<string, unknown>>;
        for (const revision of revisions.slice(policy.keepLastRevisions)) {
          this.database.prepare("DELETE FROM activity_fts WHERE revision_id = ?").run(String(revision.id));
          this.database.prepare("DELETE FROM journey_revisions WHERE id = ?").run(String(revision.id));
          deletedRevisions += 1;
        }
      }
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
    await this.collectUnreferencedObjects();
    return { deletedRevisions };
  }

  async exportJourneyPackage(journeyIds: readonly string[]): Promise<Uint8Array> {
    this.assertOpen();
    const uniqueIds = [...new Set(journeyIds)];
    if (uniqueIds.length === 0) throw new Error("Select at least one Journey to export");
    const entries: Record<string, Uint8Array> = {};
    const archiveDocument: PortableArchiveDocument = { formatVersion: 1, journeys: [] };
    const rendererReferences = new Set<string>();

    for (const journeyId of uniqueIds) {
      const summary = (await this.listJourneys()).find(({ id }) => id === journeyId);
      if (!summary) throw new Error(`Journey does not exist: ${journeyId}`);
      const overlay = this.overlayFor(journeyId);
      if (overlay.rendererId) rendererReferences.add(overlay.rendererId);
      const journeyRecord: PortableArchiveDocument["journeys"][number] = {
        id: journeyId,
        sourceAgent: summary.sourceAgent,
        nativeSessionId: summary.nativeSessionId,
        ...(summary.projectName ? { projectName: summary.projectName } : {}),
        overlay,
        revisions: []
      };
      for (const revision of this.revisionRows(journeyId).slice().reverse()) {
        const sourceFiles = [] as PortableArchiveDocument["journeys"][number]["revisions"][number]["sourceFiles"];
        for (const file of this.sourceFileRows(revision.id)) {
          const entry = packageEntryPath(journeyId, revision.id, file.relativePath);
          const bytes = await this.objects.get(file.hash);
          entries[entry] = bytes;
          sourceFiles.push({ relativePath: file.relativePath, entry, sha256: file.hash, size: file.size });
        }
        const interpretations = this.database.prepare(`
          SELECT id, provenance, document_json FROM interpretations WHERE revision_id = ? ORDER BY created_at, id
        `).all(revision.id).map((row) => {
          const value = row as Record<string, unknown>;
          const document = JSON.parse(String(value.document_json)) as InterpretationDocument;
          assertInterpretationDocument(document);
          return {
            id: String(value.id),
            provenance: value.provenance === "external" ? "external" as const : "local" as const,
            document
          };
        });
        const observations = [] as PortableArchiveDocument["journeys"][number]["revisions"][number]["observations"];
        const observationRows = this.database.prepare(`
          SELECT observed_at, provenance_json, manifest_hash
          FROM revision_observations WHERE revision_id = ? ORDER BY observed_at, id
        `).all(revision.id) as Array<Record<string, unknown>>;
        for (const observation of observationRows) {
          const manifestHash = optionalString(observation.manifest_hash);
          const observedManifest = manifestHash
            ? JSON.parse(new TextDecoder().decode(await this.objects.get(manifestHash))) as Array<{ relativePath: string; hash: string; size: number }>
            : sourceFiles.map((file) => ({ relativePath: file.relativePath, hash: file.sha256, size: file.size }));
          observations.push({
            observedAt: String(observation.observed_at),
            sourceProvenance: JSON.parse(String(observation.provenance_json ?? "{}")) as Record<string, JsonValue>,
            files: observedManifest.map((file) => ({ relativePath: file.relativePath, sha256: file.hash, size: file.size }))
          });
        }
        journeyRecord.revisions.push({
          id: revision.id,
          capturedAt: revision.capturedAt,
          currentInterpretationId: revision.currentInterpretationId,
          ...(revision.sourceProvenance ? { sourceProvenance: revision.sourceProvenance } : {}),
          observations,
          sourceFiles,
          interpretations
        });
      }
      archiveDocument.journeys.push(journeyRecord);
    }

    entries["archive.json"] = strToU8(stableJson(archiveDocument));
    const manifest: JourneyPackageManifestDocument = {
      formatVersion: 1,
      createdAt: nowIso(),
      journeyIds: [uniqueIds[0]!, ...uniqueIds.slice(1)],
      files: Object.entries(entries).sort(([left], [right]) => left.localeCompare(right)).map(([entryPath, bytes]) => ({
        path: entryPath,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        size: bytes.byteLength
      })),
      ...(rendererReferences.size > 0 ? { rendererReferences: [...rendererReferences] } : {})
    };
    entries["manifest.json"] = strToU8(stableJson(manifest));
    return zipSync(entries, { level: 6 });
  }

  async importJourneyPackage(bytes: Uint8Array): Promise<JourneyPackageImportResult> {
    this.assertOpen();
    if (bytes.byteLength > 512 * 1024 * 1024) throw new Error("Journey Package exceeds the 512 MB compressed limit");
    let declaredExpandedBytes = 0;
    const entries = unzipSync(bytes, {
      filter(file) {
        validatePackageEntryPath(file.name);
        declaredExpandedBytes += file.originalSize;
        if (declaredExpandedBytes > 2 * 1024 * 1024 * 1024) throw new Error("Journey Package exceeds the 2 GB expanded limit");
        return true;
      }
    });
    let totalBytes = 0;
    for (const [entry, content] of Object.entries(entries)) {
      validatePackageEntryPath(entry);
      totalBytes += content.byteLength;
      if (totalBytes > 2 * 1024 * 1024 * 1024) throw new Error("Journey Package exceeds the 2 GB expanded limit");
    }
    const manifestBytes = entries["manifest.json"];
    const archiveBytes = entries["archive.json"];
    if (!manifestBytes || !archiveBytes) throw new Error("Journey Package is missing its manifest or archive document");
    const manifest: unknown = JSON.parse(strFromU8(manifestBytes));
    assertJourneyPackageManifestDocument(manifest);
    const listed = new Set(manifest.files.map(({ path: entryPath }) => entryPath));
    for (const file of manifest.files) {
      validatePackageEntryPath(file.path);
      const content = entries[file.path];
      if (!content) throw new Error(`Journey Package file is missing: ${file.path}`);
      if (content.byteLength !== file.size) throw new Error(`Journey Package size mismatch: ${file.path}`);
      const actual = createHash("sha256").update(content).digest("hex");
      if (actual !== file.sha256) throw new Error(`Journey Package checksum mismatch: ${file.path}`);
    }
    for (const entry of Object.keys(entries)) {
      if (entry !== "manifest.json" && !listed.has(entry)) throw new Error(`Journey Package contains an unlisted file: ${entry}`);
    }
    const portable = JSON.parse(strFromU8(archiveBytes)) as PortableArchiveDocument;
    if (portable.formatVersion !== 1 || !Array.isArray(portable.journeys)) throw new Error("Unsupported Journey Package archive document");

    // Validate every derived document and byte reference before committing anything.
    for (const journey of portable.journeys) {
      if (!journey || typeof journey !== "object" || typeof journey.id !== "string" ||
          typeof journey.sourceAgent !== "string" || typeof journey.nativeSessionId !== "string" ||
          !Array.isArray(journey.revisions) || !journey.overlay || !Array.isArray(journey.overlay.tags) ||
          !Array.isArray(journey.overlay.annotations)) {
        throw new Error("Journey Package archive metadata is invalid");
      }
      if (!manifest.journeyIds.includes(journey.id)) throw new Error(`Unlisted Journey in archive document: ${journey.id}`);
      for (const revision of journey.revisions) {
        if (!revision || typeof revision.id !== "string" || typeof revision.capturedAt !== "string" ||
            typeof revision.currentInterpretationId !== "string" || !Array.isArray(revision.sourceFiles) ||
            !Array.isArray(revision.interpretations) || !Array.isArray(revision.observations)) {
          throw new Error(`Invalid revision metadata in Journey ${journey.id}`);
        }
        for (const file of revision.sourceFiles) {
          const content = entries[file.entry];
          if (!content || createHash("sha256").update(content).digest("hex") !== file.sha256) {
            throw new Error(`Invalid Source Evidence entry: ${file.entry}`);
          }
        }
        const sourceHashes = new Set(revision.sourceFiles.map(({ sha256 }) => sha256));
        for (const observation of revision.observations) {
          if (!observation || typeof observation.observedAt !== "string" || !Array.isArray(observation.files) ||
              !observation.sourceProvenance || typeof observation.sourceProvenance !== "object") {
            throw new Error(`Invalid Source Provenance observation in revision ${revision.id}`);
          }
          if (observation.files.some((file) => !sourceHashes.has(file.sha256))) {
            throw new Error(`Observation references evidence absent from revision ${revision.id}`);
          }
        }
        for (const interpretation of revision.interpretations) assertInterpretationDocument(interpretation.document);
      }
    }

    const importedJourneyIds = new Set<string>();
    let revisionCount = 0;
    let interpretationCount = 0;
    for (const journey of portable.journeys) {
      let actualJourneyId: string | undefined;
      for (const revision of journey.revisions) {
        const files = revision.sourceFiles.map((file) => ({ relativePath: file.relativePath, bytes: entries[file.entry]! }));
        for (const interpretation of revision.interpretations) {
          const committed = await this.commitCapture({
            files,
            interpretation: interpretation.document,
            capturedAt: revision.capturedAt,
            interpretationProvenance: "external",
            sourceProvenance: {
              kind: "package-import",
              ...(revision.sourceProvenance ? { original: revision.sourceProvenance } : {})
            }
          });
          if (committed.revisionId !== revision.id || committed.interpretationId !== interpretation.id) {
            throw new Error("Journey Package identity does not match its content");
          }
          actualJourneyId = committed.journeyId;
          interpretationCount += 1;
        }
        if (revision.interpretations.some(({ id }) => id === revision.currentInterpretationId)) {
          this.database.prepare("UPDATE journey_revisions SET current_interpretation_id = ? WHERE id = ?")
            .run(revision.currentInterpretationId, revision.id);
        }
        for (const observation of revision.observations) {
          const observedManifest = observation.files.map((file) => ({
            relativePath: file.relativePath,
            hash: file.sha256,
            size: file.size
          }));
          const manifestBytes = new TextEncoder().encode(stableJson(observedManifest));
          const manifestObject = await this.objects.put(manifestBytes);
          this.database.prepare(`
            INSERT INTO archive_objects(hash, byte_size, stored_size, created_at) VALUES (?, ?, ?, ?)
            ON CONFLICT(hash) DO NOTHING
          `).run(manifestObject.hash, manifestObject.size, manifestObject.storedSize, observation.observedAt);
          this.database.prepare(`
            INSERT INTO revision_observations(id, revision_id, observed_at, provenance_json, manifest_hash)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(id) DO NOTHING
          `).run(
            hash([
              "observation",
              revision.id,
              stableJson({ kind: "package-imported-observation", original: observation.sourceProvenance }),
              manifestObject.hash
            ]),
            revision.id,
            observation.observedAt,
            stableJson({ kind: "package-imported-observation", original: observation.sourceProvenance }),
            manifestObject.hash
          );
        }
        revisionCount += 1;
      }
      if (!actualJourneyId || actualJourneyId !== journey.id) throw new Error("Journey Package contains an empty or mismatched Journey");
      importedJourneyIds.add(actualJourneyId);
      let projectId: string | null | undefined = journey.overlay.projectId;
      if (journey.projectName) projectId = (await this.createProject(journey.projectName)).id;
      await this.updateReviewOverlay(actualJourneyId, {
        ...(journey.overlay.displayTitle ? { displayTitle: journey.overlay.displayTitle } : {}),
        ...(projectId ? { projectId } : {}),
        ...(journey.overlay.rendererId ? { rendererId: journey.overlay.rendererId } : {}),
        tags: journey.overlay.tags
      });
      for (const annotation of journey.overlay.annotations) {
        await this.updateReviewAnnotation(actualJourneyId, annotation.evidenceAnchor, {
          bookmarked: annotation.bookmarked,
          ...(annotation.note ? { note: annotation.note } : {})
        });
      }
    }
    return { journeyIds: [...importedJourneyIds], revisions: revisionCount, interpretations: interpretationCount };
  }

  close(): void {
    if (!this.initialized) return;
    this.database.close();
    this.initialized = false;
  }

  private normalizeBundle(files: readonly SourceBundleFile[]): Array<{ relativePath: string; bytes: Uint8Array }> {
    if (files.length === 0) throw new Error("A Source Bundle must contain at least one file");
    const normalized = files
      .map((file) => ({ relativePath: normalizeRelativePath(file.relativePath), bytes: file.bytes }))
      .sort((left, right) => left.relativePath.localeCompare(right.relativePath));
    if (new Set(normalized.map(({ relativePath }) => relativePath)).size !== normalized.length) {
      throw new Error("A Source Bundle cannot contain duplicate relative paths");
    }
    return normalized;
  }

  private async storeFiles(files: readonly { relativePath: string; bytes: Uint8Array }[]) {
    const stored = [] as Array<{ relativePath: string; hash: string; size: number; storedSize: number }>;
    for (const file of files) {
      const object = await this.objects.put(file.bytes);
      stored.push({ relativePath: file.relativePath, hash: object.hash, size: object.size, storedSize: object.storedSize });
    }
    return stored;
  }

  private recordStoredObjects(
    files: readonly { hash: string; size: number; storedSize: number }[],
    manifest: { hash: string; size: number; storedSize: number } | undefined,
    timestamp: string
  ): void {
    const insert = this.database.prepare(`
      INSERT INTO archive_objects(hash, byte_size, stored_size, created_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(hash) DO NOTHING
    `);
    for (const file of files) insert.run(file.hash, file.size, file.storedSize, timestamp);
    if (manifest) insert.run(manifest.hash, manifest.size, manifest.storedSize, timestamp);
  }

  private insertActivities(
    journeyId: string,
    revisionId: string,
    interpretationId: string,
    interpretation: InterpretationDocument
  ): void {
    const insertActivity = this.database.prepare(`
      INSERT INTO activities(
        interpretation_id, journey_id, revision_id, activity_id, kind, evidence_anchor,
        thread_id, source_order, timestamp, text_content, document_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertFts = this.database.prepare(`
      INSERT INTO activity_fts(text_content, native_name, capabilities, activity_id, interpretation_id, journey_id, revision_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const activity of interpretation.activities) {
      insertActivity.run(
        interpretationId,
        journeyId,
        revisionId,
        activity.id,
        activity.kind,
        activity.evidenceAnchor,
        activity.threadId,
        activity.sourceOrder,
        activity.timestamp ?? null,
        activity.text ?? "",
        stableJson(activity)
      );
      insertFts.run(
        searchableActivityText(activity),
        activity.nativeName ?? "",
        activity.toolCapabilities?.join(" ") ?? "",
        activity.id,
        interpretationId,
        journeyId,
        revisionId
      );
    }
  }

  private insertSensitiveFindings(
    revisionId: string,
    interpretationId: string,
    files: readonly { relativePath: string; bytes: Uint8Array }[],
    interpretation: InterpretationDocument
  ): void {
    const insert = this.database.prepare(`
      INSERT INTO sensitive_findings(
        id, revision_id, interpretation_id, scope, kind, activity_id, relative_path, start_offset, match_length
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO NOTHING
    `);
    for (const file of files) {
      const text = textBytes(file.bytes);
      if (text === undefined) continue;
      for (const finding of detectSensitiveFindings(text)) {
        const id = hash(["finding", revisionId, file.relativePath, String(finding.start), finding.kind]);
        insert.run(id, revisionId, null, "source-file", finding.kind, null, file.relativePath, finding.start, finding.length);
      }
    }
    for (const activity of interpretation.activities) {
      if (activity.text) {
        for (const finding of detectSensitiveFindings(activity.text)) {
          const id = hash(["finding", interpretationId, activity.id, "text", String(finding.start), finding.kind]);
          insert.run(id, revisionId, interpretationId, "activity-text", finding.kind, activity.id, null, finding.start, finding.length);
        }
      }
      const payloadText = activity.payload === undefined ? "" : stableJson(activity.payload);
      for (const finding of detectSensitiveFindings(payloadText)) {
        const id = hash(["finding", interpretationId, activity.id, "payload", String(finding.start), finding.kind]);
        insert.run(id, revisionId, interpretationId, "activity-payload", finding.kind, activity.id, null, finding.start, finding.length);
      }
    }
  }

  private summarySql(): string {
    return `
      SELECT
        j.id, j.source_agent, j.native_session_id,
        COALESCE(o.display_title, j.title) AS title,
        j.workspace, j.source_agent_version, j.started_at, j.updated_at, j.latest_revision_id,
        COUNT(a.activity_id) AS activity_count,
        SUM(CASE WHEN a.kind = 'unclassified' THEN 1 ELSE 0 END) AS unclassified_count,
        parent.id AS parent_journey_id,
        o.project_id, p.name AS project_name, o.tags_json
      FROM journeys j
      JOIN journey_revisions r ON r.id = j.latest_revision_id
      JOIN interpretations i ON i.id = r.current_interpretation_id
      LEFT JOIN activities a ON a.interpretation_id = i.id
      LEFT JOIN review_overlays o ON o.journey_id = j.id
      LEFT JOIN projects p ON p.id = o.project_id
      LEFT JOIN journeys parent ON parent.source_agent = j.source_agent AND parent.native_session_id = j.parent_native_session_id
      GROUP BY j.id
      ORDER BY COALESCE(j.started_at, j.updated_at) DESC
    `;
  }

  private summaryFromRow(row: unknown): JourneySummary {
    const value = row as Record<string, unknown>;
    const title = optionalString(value.title);
    const workspace = optionalString(value.workspace);
    const sourceAgentVersion = optionalString(value.source_agent_version);
    const startedAt = optionalString(value.started_at);
    const parentJourneyId = optionalString(value.parent_journey_id);
    const projectId = optionalString(value.project_id);
    const projectName = optionalString(value.project_name);
    return {
      id: String(value.id),
      sourceAgent: String(value.source_agent),
      nativeSessionId: String(value.native_session_id),
      ...(title ? { title } : {}),
      ...(workspace ? { workspace } : {}),
      ...(sourceAgentVersion ? { sourceAgentVersion } : {}),
      ...(startedAt ? { startedAt } : {}),
      updatedAt: String(value.updated_at),
      latestRevisionId: String(value.latest_revision_id),
      activityCount: asNumber(value.activity_count),
      unclassifiedCount: asNumber(value.unclassified_count),
      ...(parentJourneyId ? { parentJourneyId } : {}),
      ...(projectId ? { projectId } : {}),
      ...(projectName ? { projectName } : {}),
      tags: parseStringArray(value.tags_json)
    };
  }

  private sourceFileRows(revisionId: string): Array<{ relativePath: string; hash: string; size: number }> {
    return this.database.prepare(`
      SELECT relative_path, object_hash, byte_size FROM revision_files WHERE revision_id = ? ORDER BY relative_path
    `).all(revisionId).map((file) => {
      const value = file as Record<string, unknown>;
      return { relativePath: String(value.relative_path), hash: String(value.object_hash), size: asNumber(value.byte_size) };
    });
  }

  private revisionRows(journeyId: string): RevisionSummaryDocument[] {
    return this.database.prepare(`
      SELECT r.id, r.source_fingerprint, r.captured_at, r.provenance_json, r.identity_conflict, r.current_interpretation_id,
        (SELECT COUNT(*) FROM revision_files f WHERE f.revision_id = r.id) AS file_count,
        (SELECT COUNT(*) FROM interpretations i WHERE i.revision_id = r.id) AS interpretation_count,
        (SELECT COUNT(*) FROM revision_observations ro WHERE ro.revision_id = r.id) AS observation_count
      FROM journey_revisions r WHERE r.journey_id = ? ORDER BY r.captured_at DESC, r.id DESC
    `).all(journeyId).map((row) => {
      const value = row as Record<string, unknown>;
      return {
        id: String(value.id),
        sourceFingerprint: String(value.source_fingerprint),
        capturedAt: String(value.captured_at),
        currentInterpretationId: String(value.current_interpretation_id),
        fileCount: asNumber(value.file_count),
        interpretationCount: asNumber(value.interpretation_count),
        observationCount: asNumber(value.observation_count),
        identityConflict: asNumber(value.identity_conflict) === 1,
        sourceProvenance: JSON.parse(String(value.provenance_json ?? "{}")) as Record<string, never>
      };
    });
  }

  private interpretationRows(revisionId: string): InterpretationSummaryDocument[] {
    return this.database.prepare(`
      SELECT i.*,
        (SELECT COUNT(*) FROM activities a WHERE a.interpretation_id = i.id) AS activity_count
      FROM interpretations i WHERE i.revision_id = ? ORDER BY i.created_at DESC, i.id DESC
    `).all(revisionId).map((row) => {
      const value = row as Record<string, unknown>;
      const interpretation = JSON.parse(String(value.document_json)) as InterpretationDocument;
      return {
        id: String(value.id),
        adapterId: String(value.adapter_id),
        adapterVersion: String(value.adapter_version),
        schemaVersion: String(value.schema_version),
        provenance: value.provenance === "external" ? "external" : "local",
        createdAt: String(value.created_at),
        activityCount: asNumber(value.activity_count),
        unclassifiedCount: interpretation.coverage.dispositions.filter(({ disposition }) => disposition === "unclassified").length,
        malformedCount: interpretation.coverage.dispositions.filter(({ disposition }) => disposition === "malformed").length
      };
    });
  }

  private overlayFor(journeyId: string): ReviewOverlayDocument {
    const row = this.database.prepare("SELECT * FROM review_overlays WHERE journey_id = ?").get(journeyId) as Record<string, unknown> | undefined;
    const annotations = this.database.prepare(`
      SELECT evidence_anchor, bookmarked, note FROM review_annotations WHERE journey_id = ? ORDER BY updated_at
    `).all(journeyId).map((annotation) => {
      const value = annotation as Record<string, unknown>;
      const note = optionalString(value.note);
      return {
        evidenceAnchor: String(value.evidence_anchor),
        bookmarked: asNumber(value.bookmarked) === 1,
        ...(note ? { note } : {})
      } satisfies ReviewAnnotationDocument;
    });
    if (!row) return { journeyId, tags: [], annotations, updatedAt: nowIso() };
    const displayTitle = optionalString(row.display_title);
    const projectId = optionalString(row.project_id);
    const rendererId = optionalString(row.renderer_id);
    return {
      journeyId,
      ...(displayTitle ? { displayTitle } : {}),
      ...(projectId ? { projectId } : {}),
      ...(rendererId ? { rendererId } : {}),
      tags: parseStringArray(row.tags_json),
      annotations,
      updatedAt: String(row.updated_at)
    };
  }

  private sensitiveFindingRows(revisionId: string, interpretationId: string): SensitiveFindingDocument[] {
    return this.database.prepare(`
      SELECT * FROM sensitive_findings
      WHERE revision_id = ? AND (interpretation_id IS NULL OR interpretation_id = ?)
      ORDER BY scope, relative_path, activity_id, start_offset
    `).all(revisionId, interpretationId).map((row) => {
      const value = row as Record<string, unknown>;
      const activityId = optionalString(value.activity_id);
      const relativePath = optionalString(value.relative_path);
      return {
        id: String(value.id),
        scope: value.scope === "source-file"
          ? "source-file"
          : value.scope === "activity-payload"
            ? "activity-payload"
            : "activity-text",
        kind: String(value.kind),
        ...(activityId ? { activityId } : {}),
        ...(relativePath ? { relativePath } : {}),
        start: asNumber(value.start_offset),
        length: asNumber(value.match_length)
      };
    });
  }

  private pendingSummary(row: unknown): PendingEvidenceDocument {
    const value = row as Record<string, unknown>;
    return {
      id: String(value.id),
      sourceAgent: String(value.source_agent),
      nativeSessionId: String(value.native_session_id),
      adapterId: String(value.adapter_id),
      adapterVersion: String(value.adapter_version),
      error: String(value.error),
      createdAt: String(value.created_at),
      fileCount: asNumber(value.file_count)
    };
  }

  private retentionPolicyFromRow(value: Record<string, unknown>): RetentionPolicy {
    const keep = value.keep_last_revisions === null || value.keep_last_revisions === undefined
      ? undefined
      : asNumber(value.keep_last_revisions);
    return {
      id: String(value.id),
      scope: "archive",
      ...(keep ? { keepLastRevisions: keep } : {}),
      createdAt: String(value.created_at),
      updatedAt: String(value.updated_at)
    };
  }

  private requireJourney(journeyId: string): void {
    if (!this.database.prepare("SELECT id FROM journeys WHERE id = ?").get(journeyId)) {
      throw new Error("Journey does not exist");
    }
  }

  private async isCompatibleExtension(
    previousRevisionId: string,
    files: readonly { relativePath: string; bytes: Uint8Array }[],
    storedFiles: readonly { relativePath: string; hash: string }[]
  ): Promise<boolean> {
    const previousRows = this.database.prepare(`
      SELECT relative_path, object_hash FROM revision_files WHERE revision_id = ?
    `).all(previousRevisionId) as Array<Record<string, unknown>>;
    const previous = await Promise.all(previousRows.map(async (row) => ({
      relativePath: String(row.relative_path),
      hash: String(row.object_hash),
      bytes: await this.objects.get(String(row.object_hash))
    })));
    const current = files.map((file) => ({
      ...file,
      hash: storedFiles.find(({ relativePath }) => relativePath === file.relativePath)?.hash ??
        createHash("sha256").update(file.bytes).digest("hex")
    }));

    const startsWith = (candidate: Uint8Array, prefix: Uint8Array): boolean => {
      if (candidate.byteLength < prefix.byteLength) return false;
      for (let index = 0; index < prefix.byteLength; index += 1) {
        if (candidate[index] !== prefix[index]) return false;
      }
      return true;
    };
    const covers = (
      base: readonly { relativePath: string; hash: string; bytes: Uint8Array }[],
      extension: readonly { relativePath: string; hash: string; bytes: Uint8Array }[]
    ): boolean => base.every((baseFile) => {
      const exact = extension.find(({ hash: candidateHash }) => candidateHash === baseFile.hash);
      if (exact) return true;
      const samePath = extension.find(({ relativePath }) => relativePath === baseFile.relativePath);
      if (samePath) return startsWith(samePath.bytes, baseFile.bytes);
      const basename = baseFile.relativePath.split("/").at(-1);
      const basenameMatches = extension.filter(({ relativePath }) => relativePath.split("/").at(-1) === basename);
      return basenameMatches.length === 1 && startsWith(basenameMatches[0]!.bytes, baseFile.bytes);
    });
    return covers(previous, current) || covers(current, previous);
  }

  private async collectUnreferencedObjects(): Promise<void> {
    const rows = this.database.prepare(`
      SELECT o.hash
      FROM archive_objects o
      LEFT JOIN revision_files rf ON rf.object_hash = o.hash
      LEFT JOIN journey_revisions r ON r.manifest_hash = o.hash
      LEFT JOIN revision_observations ro ON ro.manifest_hash = o.hash
      LEFT JOIN pending_evidence_files pf ON pf.object_hash = o.hash
      WHERE rf.object_hash IS NULL AND r.manifest_hash IS NULL AND ro.manifest_hash IS NULL AND pf.object_hash IS NULL
    `).all() as Array<Record<string, unknown>>;
    for (const row of rows) {
      const objectHash = String(row.hash);
      await this.objects.remove(objectHash);
      this.database.prepare("DELETE FROM archive_objects WHERE hash = ?").run(objectHash);
    }
  }

  private migrateSensitiveFindingScopes(): void {
    const row = this.database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'sensitive_findings'").get() as Record<string, unknown> | undefined;
    if (String(row?.sql ?? "").includes("activity-payload")) return;
    this.database.exec(`
      DROP INDEX IF EXISTS idx_sensitive_revision;
      ALTER TABLE sensitive_findings RENAME TO sensitive_findings_legacy;
      CREATE TABLE sensitive_findings (
        id TEXT PRIMARY KEY,
        revision_id TEXT NOT NULL REFERENCES journey_revisions(id) ON DELETE CASCADE,
        interpretation_id TEXT REFERENCES interpretations(id) ON DELETE CASCADE,
        scope TEXT NOT NULL CHECK(scope IN ('activity-text', 'activity-payload', 'source-file')),
        kind TEXT NOT NULL,
        activity_id TEXT,
        relative_path TEXT,
        start_offset INTEGER NOT NULL,
        match_length INTEGER NOT NULL
      ) STRICT;
      INSERT INTO sensitive_findings SELECT * FROM sensitive_findings_legacy;
      DROP TABLE sensitive_findings_legacy;
      CREATE INDEX idx_sensitive_revision ON sensitive_findings(revision_id, interpretation_id);
    `);
  }

  private ensureColumn(table: string, column: string, definition: string): void {
    const columns = this.database.prepare(`PRAGMA table_info(${table})`).all() as Array<Record<string, unknown>>;
    if (!columns.some((item) => item.name === column)) this.database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }

  private assertOpen(): void {
    if (!this.initialized) throw new Error("Archive is closed");
  }
}
