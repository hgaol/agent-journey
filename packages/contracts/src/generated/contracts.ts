/* Generated from schema/contracts.schema.json. Do not edit. */

export type SourceAgentId = string;
export type ActivityKind =
  | "human-input"
  | "context-injection"
  | "agent-output"
  | "reasoning"
  | "tool-invocation"
  | "tool-result"
  | "approval-request"
  | "approval-decision"
  | "state-transition"
  | "usage-observation"
  | "artifact"
  | "diagnostic"
  | "unclassified";
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | {
      [k: string]: JsonValue;
    };

export interface ContractDocuments {
  interpretation: InterpretationDocument;
  stage: StageDocument;
  journeySummary?: JourneySummaryDocument;
  journeyDetail?: JourneyDetailDocument;
  sourceStatus?: SourceStatusDocument;
  discoveredJourney?: DiscoveredJourneyDocument;
  captureResult?: CaptureCommitResultDocument;
  replayVideoExportOptions?: ReplayVideoExportOptionsDocument;
  searchHit?: SearchHitDocument;
  revisionSummary?: RevisionSummaryDocument;
  interpretationSummary?: InterpretationSummaryDocument;
  project?: ProjectDocument;
  reviewOverlay?: ReviewOverlayDocument;
  pendingEvidence?: PendingEvidenceDocument;
  evidenceSearchHit?: EvidenceSearchHitDocument;
  archiveVerification?: ArchiveVerificationDocument;
  sensitiveFinding?: SensitiveFindingDocument;
  pluginPackage?: PluginPackageDocument;
  journeyPackageManifest?: JourneyPackageManifestDocument;
  rendererIntent?: RendererIntentDocument;
  rendererTree?: RendererTreeDocument;
}
export interface InterpretationDocument {
  schemaVersion: "1.0.0";
  adapter: {
    id: string;
    version: string;
  };
  journey: {
    sourceAgent: SourceAgentId;
    nativeSessionId: string;
    parentNativeSessionId?: string;
    title?: string;
    workspace?: string;
    gitBranch?: string;
    sourceAgentVersion?: string;
    modelProvider?: string;
    models?: string[];
    startedAt?: string;
    endedAt?: string;
  };
  activities: ActivityDocument[];
  threads: AgentThreadDocument[];
  coverage: CoverageReportDocument;
  fidelity: FidelityManifestDocument;
  sourceExtensions?: {
    [k: string]: JsonValue;
  };
}
export interface ActivityDocument {
  id: string;
  kind: ActivityKind;
  evidenceAnchor: string;
  threadId: string;
  sourceOrder: number;
  turnId?: string;
  timestamp?: string;
  actor?: "human" | "agent" | "system" | "tool" | "unknown";
  text?: string;
  nativeName?: string;
  toolCapabilities?: (
    "shell" | "file-read" | "file-edit" | "search" | "web" | "delegation" | "interaction" | "custom"
  )[];
  status?: "pending" | "running" | "succeeded" | "failed" | "cancelled" | "unknown";
  payload?: JsonValue;
  links?: ActivityLink[];
  deliveryTrace?: DeliveryChunk[];
  sourceExtensions?: {
    [k: string]: JsonValue;
  };
}
export interface ActivityLink {
  relation: "parent" | "caused-by" | "result-of" | "spawned-by" | "returned-to" | "replaces" | "related";
  targetActivityId: string;
}
export interface DeliveryChunk {
  sequence: number;
  text: string;
  timestamp?: string;
  offsetMs?: number;
}
export interface AgentThreadDocument {
  id: string;
  parentThreadId?: string;
  spawnActivityId?: string;
  returnActivityId?: string;
  label?: string;
  model?: string;
}
export interface CoverageReportDocument {
  sourceRecordCount: number;
  dispositions: EvidenceDispositionDocument[];
  missing: string[];
}
export interface EvidenceDispositionDocument {
  evidenceAnchor: string;
  disposition: "canonical" | "metadata" | "transport" | "duplicate" | "unclassified" | "malformed";
  activityIds?: string[];
  detail?: string;
}
export interface FidelityManifestDocument {
  contentKinds: ActivityKind[];
  timedKinds: ActivityKind[];
  deliveryTraces: boolean;
  agentThreads: boolean;
  causalLinks: boolean;
  terminalStream: boolean;
  knownGaps: string[];
}
export interface StageDocument {
  schemaVersion: "1.0.0";
  journeyId: string;
  revisionId: string;
  interpretationId: string;
  sourceAgent: SourceAgentId;
  sourceAgentVersion?: string;
  title?: string;
  workspace?: string;
  gitBranch?: string;
  modelProvider?: string;
  models?: string[];
  activities: ActivityDocument[];
  threads: AgentThreadDocument[];
  turns: TurnDocument[];
  annotations: ReviewAnnotationDocument[];
  fidelity: FidelityManifestDocument;
  sensitiveFindingCount: number;
  coverageSummary: {
    sourceRecords: number;
    canonicalActivities: number;
    unclassified: number;
    malformed: number;
  };
  presentation: {
    redacted: boolean;
    view: "review" | "replay";
    playheadActivityId?: string;
    playheadDeliveryChunk?: number;
    playheadSimulatedTextLength?: number;
    simulatedInputDraft?: {
      activityId: string;
      text: string;
    };
    streamMode?: "events" | "recorded" | "simulated";
    searchQuery?: string;
    selectedActivityId?: string;
  };
}
export interface TurnDocument {
  id: string;
  activityIds: string[];
  boundaryProvenance: "evidenced" | "inferred";
  startedAt?: string;
  endedAt?: string;
}
export interface ReviewAnnotationDocument {
  evidenceAnchor: string;
  bookmarked: boolean;
  note?: string;
  resolved?: boolean;
}
export interface JourneySummaryDocument {
  id: string;
  sourceAgent: SourceAgentId;
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
export interface JourneyDetailDocument {
  summary: JourneySummaryDocument;
  revisionId: string;
  interpretationId: string;
  interpretation: InterpretationDocument;
  stage: StageDocument;
  sourceFiles: SourceFileSummaryDocument[];
  revisions: RevisionSummaryDocument[];
  interpretations: InterpretationSummaryDocument[];
  overlay: ReviewOverlayDocument;
  sensitiveFindings: SensitiveFindingDocument[];
}
export interface SourceFileSummaryDocument {
  relativePath: string;
  hash: string;
  size: number;
}
export interface RevisionSummaryDocument {
  id: string;
  sourceFingerprint: string;
  capturedAt: string;
  currentInterpretationId: string;
  fileCount: number;
  interpretationCount: number;
  observationCount?: number;
  identityConflict?: boolean;
  sourceProvenance?: {
    [k: string]: JsonValue;
  };
}
export interface InterpretationSummaryDocument {
  id: string;
  adapterId: string;
  adapterVersion: string;
  schemaVersion: string;
  provenance: "local" | "external";
  createdAt: string;
  activityCount: number;
  unclassifiedCount: number;
  malformedCount: number;
}
export interface ReviewOverlayDocument {
  journeyId: string;
  displayTitle?: string;
  projectId?: string;
  rendererId?: string;
  tags: string[];
  annotations: ReviewAnnotationDocument[];
  updatedAt: string;
}
export interface SensitiveFindingDocument {
  id: string;
  scope: "activity-text" | "activity-payload" | "source-file";
  kind: string;
  activityId?: string;
  relativePath?: string;
  start: number;
  length: number;
}
export interface SourceStatusDocument {
  sourceAgent: SourceAgentId;
  displayName: string;
  adapterId: string;
  adapterVersion: string;
  suggestedRoot: string;
  available: boolean;
  approved: boolean;
  approvedRoot?: string;
  scanPolicy: "manual" | "automatic";
}
export interface DiscoveredJourneyDocument {
  sourceAgent: SourceAgentId;
  nativeSessionId: string;
  relativePaths: string[];
  title?: string;
  workspace?: string;
  sourceAgentVersion?: string;
  startedAt?: string;
  lastModifiedAt?: string;
  byteSize?: number;
  turnCountEstimate?: number;
  locator: {
    [k: string]: unknown;
  };
  [k: string]: unknown;
}
export interface CaptureCommitResultDocument {
  journeyId: string;
  revisionId: string;
  interpretationId: string;
  newJourney: boolean;
  newRevision: boolean;
  newInterpretation: boolean;
}
export interface ReplayVideoExportOptionsDocument {
  rendererId: string;
  exportId?: string;
  browser?: "auto" | "chromium" | "chrome" | "edge" | "webkit";
  quality: "720p" | "1080p" | "1440p";
  speed: 0.5 | 1 | 2 | 4 | 8 | 16;
  fps: 30 | 60;
  streamMode: "events" | "recorded" | "simulated";
  promptTyping?: boolean;
  reveal: boolean;
  revisionId?: string;
  interpretationId?: string;
}
export interface SearchHitDocument {
  journeyId: string;
  revisionId: string;
  interpretationId: string;
  activityId: string;
  sourceAgent: SourceAgentId;
  title?: string;
  kind: ActivityKind;
  text: string;
  evidenceAnchor: string;
}
export interface ProjectDocument {
  id: string;
  name: string;
  journeyCount: number;
  createdAt: string;
  updatedAt: string;
}
export interface PendingEvidenceDocument {
  id: string;
  sourceAgent: SourceAgentId;
  nativeSessionId: string;
  adapterId: string;
  adapterVersion: string;
  error: string;
  createdAt: string;
  fileCount: number;
}
export interface EvidenceSearchHitDocument {
  relativePath: string;
  line: number;
  column: number;
  text: string;
  redacted: boolean;
}
export interface ArchiveVerificationDocument {
  checkedObjects: number;
  checkedInterpretations: number;
  issues: ArchiveIssueDocument[];
}
export interface ArchiveIssueDocument {
  kind:
    "missing-object" | "corrupt-object" | "orphan-object" | "invalid-interpretation" | "orphan-index" | "permission";
  message: string;
  objectHash?: string;
  journeyId?: string;
}
export interface PluginPackageDocument {
  formatVersion: 1;
  manifest: RendererPluginManifestDocument | SourceAdapterPluginManifestDocument;
  css?: string;
  javascript?: string;
  assets?: PluginAssetDocument[];
  integrity: string;
}
export interface RendererPluginManifestDocument {
  type: "renderer";
  id: string;
  version: string;
  displayName: string;
  interfaceVersion: string;
  kind: "style-pack" | "renderer";
  targetSourceAgent?: SourceAgentId;
  targetAgentVersions?: string;
}
export interface SourceAdapterPluginManifestDocument {
  type: "source-adapter";
  id: string;
  version: string;
  displayName: string;
  interfaceVersion: string;
  sourceAgent: SourceAgentId;
  defaultRootSegments: {
    posix: string[];
    windows: string[];
  };
  discovery: {
    include: string[];
  };
}
export interface PluginAssetDocument {
  path: string;
  mediaType: string;
  base64: string;
}
export interface JourneyPackageManifestDocument {
  formatVersion: 1;
  createdAt: string;
  /**
   * @minItems 1
   */
  journeyIds: [string, ...string[]];
  files: JourneyPackageFileDocument[];
  rendererReferences?: string[];
}
export interface JourneyPackageFileDocument {
  path: string;
  sha256: string;
  size: number;
}
export interface RendererIntentDocument {
  type: "seek-activity" | "open-evidence" | "copy-content" | "annotate-activity";
  activityId: string;
}
export interface RendererTreeDocument {
  root: RendererTreeNodeDocument;
}
export interface RendererTreeNodeDocument {
  tag:
    | "div"
    | "main"
    | "section"
    | "article"
    | "header"
    | "footer"
    | "h1"
    | "h2"
    | "h3"
    | "h4"
    | "p"
    | "span"
    | "pre"
    | "code"
    | "details"
    | "summary"
    | "ul"
    | "ol"
    | "li"
    | "button"
    | "img";
  className?: string;
  text?: string;
  title?: string;
  assetPath?: string;
  intent?: RendererIntentDocument;
  /**
   * @maxItems 10000
   */
  children?: RendererTreeNodeDocument[];
}
