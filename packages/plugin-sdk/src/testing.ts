import path from "node:path";
import { assertInterpretationDocument } from "@agentjourney/contracts/validate";
import type {
  RendererPlugin,
  SourceAdapterPlugin,
  SourceBundleView,
  SourceEntry,
  VirtualSource
} from "./index.js";

function normalizeRelative(input: string): string {
  const normalized = input.replaceAll("\\", "/").replace(/^\.\//, "");
  if (normalized.startsWith("/") || normalized.split("/").includes("..")) {
    throw new Error(`path escapes virtual source: ${input}`);
  }
  return normalized;
}

export class MemorySource implements VirtualSource, SourceBundleView {
  readonly rootId: string;
  private readonly files: Map<string, Uint8Array>;

  constructor(files: Record<string, string | Uint8Array>, rootId = "memory") {
    this.rootId = rootId;
    this.files = new Map(
      Object.entries(files).map(([filePath, value]) => [
        normalizeRelative(filePath),
        typeof value === "string" ? new TextEncoder().encode(value) : value
      ])
    );
  }

  get paths(): readonly string[] {
    return [...this.files.keys()].sort();
  }

  async list(): Promise<readonly SourceEntry[]> {
    return this.paths.map((filePath) => ({
      path: filePath,
      size: this.files.get(filePath)?.byteLength ?? 0
    }));
  }

  readBytes(relativePath: string): Uint8Array {
    const key = normalizeRelative(relativePath);
    const bytes = this.files.get(key);
    if (!bytes) throw new Error(`missing virtual file: ${key}`);
    return bytes.slice();
  }

  readText(relativePath: string): string {
    return new TextDecoder().decode(this.readBytes(relativePath));
  }

  has(relativePath: string): boolean {
    return this.files.has(normalizeRelative(relativePath));
  }
}

export function assertPortableRelativePath(input: string): string {
  const normalized = normalizeRelative(input);
  if (path.posix.isAbsolute(normalized)) throw new Error(`absolute path is not portable: ${input}`);
  return normalized;
}

export interface AdapterConformanceResult {
  candidates: number;
  interpretations: number;
  sourceRecords: number;
  activities: number;
}

export async function runSourceAdapterConformance(
  adapter: SourceAdapterPlugin,
  source: VirtualSource & SourceBundleView
): Promise<AdapterConformanceResult> {
  const firstDiscovery = await adapter.discover(source);
  const secondDiscovery = await adapter.discover(source);
  if (JSON.stringify(firstDiscovery) !== JSON.stringify(secondDiscovery)) {
    throw new Error(`${adapter.manifest.id}: discovery is not deterministic`);
  }
  let sourceRecords = 0;
  let activities = 0;
  for (const candidate of firstDiscovery) {
    if (candidate.sourceAgent !== adapter.manifest.sourceAgent) throw new Error("candidate Source Agent mismatch");
    candidate.relativePaths.forEach(assertPortableRelativePath);
    const interpretation = await adapter.interpret(candidate, source);
    assertInterpretationDocument(interpretation);
    if (interpretation.journey.nativeSessionId !== candidate.nativeSessionId) throw new Error("Interpretation identity mismatch");
    if (interpretation.coverage.sourceRecordCount !== interpretation.coverage.dispositions.length) {
      throw new Error("Coverage Report does not account for every source record");
    }
    if (interpretation.activities.some(({ evidenceAnchor }) => !evidenceAnchor)) {
      throw new Error("Canonical Activity lacks an Evidence Anchor");
    }
    sourceRecords += interpretation.coverage.sourceRecordCount;
    activities += interpretation.activities.length;
  }
  return { candidates: firstDiscovery.length, interpretations: firstDiscovery.length, sourceRecords, activities };
}

export function assertRendererConformance(renderer: RendererPlugin): void {
  if (!renderer.manifest.id || !renderer.manifest.version || !renderer.manifest.interfaceVersion) {
    throw new Error("Renderer manifest identity and interface version are required");
  }
  if (/@import\b|url\s*\(\s*["']?\s*(?:https?:|\/\/)|expression\s*\(/iu.test(renderer.css)) {
    throw new Error("Renderer CSS attempts external or executable behavior");
  }
  if (renderer.manifest.kind === "style-pack" && renderer.javascript) {
    throw new Error("Style Packs cannot include JavaScript");
  }
}
