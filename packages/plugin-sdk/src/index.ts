import type {
  DiscoveredJourneyDocument,
  InterpretationDocument,
  RendererIntentDocument,
  SourceAgentId,
  StageDocument
} from "@agentjourney/contracts";

export interface SourceEntry {
  path: string;
  size: number;
  modifiedAt?: string | undefined;
}

/** Capability-limited view rooted at one approved Source Root. */
export interface VirtualSource {
  readonly rootId: string;
  list(): Promise<readonly SourceEntry[]> | readonly SourceEntry[];
  readBytes(relativePath: string): Promise<Uint8Array> | Uint8Array;
  readText(relativePath: string): Promise<string> | string;
}

export interface DiscoveredJourney extends DiscoveredJourneyDocument {
  sourceAgent: SourceAgentId;
  locator: Record<string, unknown>;
}

export interface SourceAdapterManifest {
  id: string;
  version: string;
  interfaceVersion: string;
  displayName: string;
  sourceAgent: SourceAgentId;
  defaultRootSegments: {
    readonly posix: readonly string[];
    readonly windows: readonly string[];
  };
}

export interface SourceBundleView {
  readonly paths: readonly string[];
  readBytes(relativePath: string): Uint8Array;
  readText(relativePath: string): string;
  has(relativePath: string): boolean;
}

export interface SourceAdapterPlugin {
  readonly manifest: SourceAdapterManifest;
  discover(source: VirtualSource): Promise<DiscoveredJourney[]>;
  interpret(candidate: DiscoveredJourney, bundle: SourceBundleView): Promise<InterpretationDocument>;
}

export interface RendererPluginManifest {
  id: string;
  version: string;
  displayName: string;
  targetSourceAgent?: SourceAgentId | undefined;
  targetAgentVersions?: string | undefined;
  interfaceVersion: string;
  kind: "style-pack" | "renderer";
}

export interface RendererPlugin {
  manifest: RendererPluginManifest;
  css: string;
  javascript?: string | undefined;
  executable?: boolean | undefined;
  assets?: Array<{ path: string; mediaType: string; base64: string }> | undefined;
  integrity?: string | undefined;
  builtIn?: boolean | undefined;
}

export interface StylePackPlugin extends RendererPlugin {
  manifest: RendererPluginManifest & { kind: "style-pack" };
  javascript?: undefined;
}

export type RendererIntent = RendererIntentDocument;

export interface RendererEnvelope {
  type: "agentjourney:stage";
  document: StageDocument;
}

export const MAIN_THREAD_ID = "main";
