import type {
  ArchiveVerificationDocument,
  EvidenceSearchHitDocument,
  InterpretationDocument,
  InterpretationSummaryDocument,
  JsonValue,
  PendingEvidenceDocument,
  ProjectDocument,
  ReviewOverlayDocument,
  RevisionSummaryDocument,
  SensitiveFindingDocument,
  StageDocument
} from "@agentjourney/contracts";

export interface SourceBundleFile {
  relativePath: string;
  bytes: Uint8Array;
}

export interface ArchiveCapture {
  files: SourceBundleFile[];
  interpretation: InterpretationDocument;
  capturedAt?: string;
  interpretationProvenance?: "local" | "external";
  sourceProvenance?: Record<string, JsonValue>;
}

export interface CaptureCommitResult {
  journeyId: string;
  revisionId: string;
  interpretationId: string;
  newJourney: boolean;
  newRevision: boolean;
  newInterpretation: boolean;
}

export interface JourneySummary {
  id: string;
  sourceAgent: string;
  nativeSessionId: string;
  title?: string;
  workspace?: string;
  sourceAgentVersion?: string;
  startedAt?: string;
  updatedAt: string;
  latestRevisionId: string;
  activityCount: number;
  unclassifiedCount: number;
  parentJourneyId?: string;
  projectId?: string;
  projectName?: string;
  tags: string[];
}

export interface JourneySelection {
  revisionId?: string;
  interpretationId?: string;
  redacted?: boolean;
}

export interface JourneyDetail {
  summary: JourneySummary;
  revisionId: string;
  interpretationId: string;
  interpretation: InterpretationDocument;
  stage: StageDocument;
  sourceFiles: Array<{ relativePath: string; hash: string; size: number }>;
  revisions: RevisionSummaryDocument[];
  interpretations: InterpretationSummaryDocument[];
  overlay: ReviewOverlayDocument;
  sensitiveFindings: SensitiveFindingDocument[];
}

export interface SearchOptions {
  query?: string;
  sourceAgent?: string;
  kind?: string;
  capability?: string;
  projectId?: string;
  from?: string;
  until?: string;
  journeyId?: string;
  limit?: number;
}

export interface SearchHit {
  journeyId: string;
  revisionId: string;
  interpretationId: string;
  activityId: string;
  sourceAgent: string;
  title?: string;
  kind: string;
  text: string;
  evidenceAnchor: string;
  matchCount: number;
  matchedKinds: string[];
}

export interface PendingEvidenceInput {
  sourceAgent: string;
  nativeSessionId: string;
  adapterId: string;
  adapterVersion: string;
  candidate: Record<string, unknown>;
  error: string;
  files: SourceBundleFile[];
}

export interface PendingEvidenceBundle {
  summary: PendingEvidenceDocument;
  candidate: Record<string, unknown>;
  files: SourceBundleFile[];
}

export interface ReviewOverlayUpdate {
  displayTitle?: string | null;
  projectId?: string | null;
  rendererId?: string | null;
  tags?: string[];
}

export interface ReviewAnnotationUpdate {
  bookmarked: boolean;
  note?: string | null;
}

export interface RetentionPolicy {
  id: string;
  scope: "archive";
  keepLastRevisions?: number;
  createdAt: string;
  updatedAt: string;
}

export interface JourneyPackageImportResult {
  journeyIds: string[];
  revisions: number;
  interpretations: number;
}

export interface CaptureExclusion {
  sourceAgent: string;
  nativeSessionId: string;
  createdAt: string;
}

export interface JourneyArchive {
  commitCapture(capture: ArchiveCapture): Promise<CaptureCommitResult>;
  listJourneys(): Promise<JourneySummary[]>;
  getJourney(journeyId: string, selection?: JourneySelection): Promise<JourneyDetail | undefined>;
  search(options: SearchOptions | string, limit?: number): Promise<SearchHit[]>;
  readSourceFile(revisionId: string, relativePath: string, redacted?: boolean): Promise<Uint8Array | undefined>;
  searchEvidence(revisionId: string, query: string, redacted?: boolean): Promise<EvidenceSearchHitDocument[]>;
  savePendingEvidence(input: PendingEvidenceInput): Promise<PendingEvidenceDocument>;
  listPendingEvidence(): Promise<PendingEvidenceDocument[]>;
  getPendingEvidence(id: string): Promise<PendingEvidenceBundle | undefined>;
  deletePendingEvidence(id: string): Promise<void>;
  listProjects(): Promise<ProjectDocument[]>;
  createProject(name: string): Promise<ProjectDocument>;
  renameProject(id: string, name: string): Promise<ProjectDocument>;
  mergeProjects(sourceId: string, targetId: string): Promise<ProjectDocument>;
  deleteProject(id: string): Promise<boolean>;
  updateReviewOverlay(journeyId: string, update: ReviewOverlayUpdate): Promise<ReviewOverlayDocument>;
  updateReviewAnnotation(journeyId: string, evidenceAnchor: string, update: ReviewAnnotationUpdate): Promise<ReviewOverlayDocument>;
  verify(): Promise<ArchiveVerificationDocument>;
  repair(): Promise<ArchiveVerificationDocument>;
  rebuildSearchIndex(): Promise<void>;
  deleteJourney(journeyId: string, exclude: boolean): Promise<boolean>;
  listCaptureExclusions(): Promise<CaptureExclusion[]>;
  removeCaptureExclusion(sourceAgent: string, nativeSessionId: string): Promise<void>;
  isCaptureExcluded(sourceAgent: string, nativeSessionId: string): Promise<boolean>;
  getRetentionPolicy(): Promise<RetentionPolicy | undefined>;
  setRetentionPolicy(keepLastRevisions?: number): Promise<RetentionPolicy>;
  applyRetentionPolicy(): Promise<{ deletedRevisions: number }>;
  exportJourneyPackage(journeyIds: readonly string[]): Promise<Uint8Array>;
  importJourneyPackage(bytes: Uint8Array): Promise<JourneyPackageImportResult>;
  close(): void;
}
