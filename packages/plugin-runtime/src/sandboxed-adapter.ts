import picomatch from "picomatch";
import type { InterpretationDocument, PluginPackageDocument } from "@agentjourney/contracts";
import { assertInterpretationDocument } from "@agentjourney/contracts/validate";
import type {
  DiscoveredJourney,
  SourceAdapterManifest,
  SourceAdapterPlugin,
  SourceBundleView,
  VirtualSource
} from "@agentjourney/plugin-sdk";
import { evaluateAdapterMethod } from "./sandbox.js";

const MAX_DISCOVERY_TEXT_BYTES = 32 * 1024 * 1024;
const MAX_FILE_TEXT_BYTES = 4 * 1024 * 1024;

function adapterManifest(document: PluginPackageDocument): SourceAdapterManifest {
  const manifest = document.manifest;
  if (manifest.type !== "source-adapter") throw new Error("Not a Source Adapter package");
  return {
    id: manifest.id,
    version: manifest.version,
    interfaceVersion: manifest.interfaceVersion,
    displayName: manifest.displayName,
    sourceAgent: manifest.sourceAgent,
    defaultRootSegments: manifest.defaultRootSegments ?? { posix: [], windows: [] }
  };
}

function assertCandidates(value: unknown, sourceAgent: string, availablePaths: Set<string>): asserts value is DiscoveredJourney[] {
  if (!Array.isArray(value)) throw new Error("Adapter discover() must return an array");
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object") throw new Error("Adapter returned an invalid candidate");
    const item = candidate as Record<string, unknown>;
    if (item.sourceAgent !== sourceAgent || typeof item.nativeSessionId !== "string" || !Array.isArray(item.relativePaths)) {
      throw new Error("Adapter candidate identity is invalid");
    }
    for (const filePath of item.relativePaths) {
      if (typeof filePath !== "string" || !availablePaths.has(filePath)) throw new Error(`Adapter requested unavailable source path: ${String(filePath)}`);
    }
    if (!item.locator || typeof item.locator !== "object" || Array.isArray(item.locator)) item.locator = {};
  }
}

export class SandboxedSourceAdapter implements SourceAdapterPlugin {
  readonly manifest: SourceAdapterManifest;
  private readonly javascript: string;
  private readonly include: (value: string) => boolean;

  constructor(document: PluginPackageDocument) {
    if (document.manifest.type !== "source-adapter" || !document.javascript) throw new Error("Invalid Source Adapter package");
    this.manifest = adapterManifest(document);
    this.javascript = document.javascript;
    this.include = picomatch(document.manifest.discovery.include, { dot: true });
  }

  async discover(source: VirtualSource): Promise<DiscoveredJourney[]> {
    const entries = (await source.list()).filter(({ path }) => this.include(path));
    let total = 0;
    const files = [] as Array<{ path: string; size: number; text?: string }>;
    for (const entry of entries) {
      const file: { path: string; size: number; text?: string } = { path: entry.path, size: entry.size };
      if (entry.size <= MAX_FILE_TEXT_BYTES && total + entry.size <= MAX_DISCOVERY_TEXT_BYTES) {
        try {
          file.text = await source.readText(entry.path);
          total += entry.size;
        } catch {
          // Binary or transient files remain discoverable by path and size.
        }
      }
      files.push(file);
    }
    const output = await evaluateAdapterMethod(this.javascript, "discover", { files });
    assertCandidates(output, this.manifest.sourceAgent, new Set(entries.map(({ path }) => path)));
    return output;
  }

  async interpret(candidate: DiscoveredJourney, bundle: SourceBundleView): Promise<InterpretationDocument> {
    const files = bundle.paths.map((filePath) => {
      const bytes = bundle.readBytes(filePath);
      let text: string | undefined;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        // Binary files are supplied as base64 only.
      }
      return {
        path: filePath,
        size: bytes.byteLength,
        ...(text !== undefined ? { text } : { base64: Buffer.from(bytes).toString("base64") })
      };
    });
    const output = await evaluateAdapterMethod(this.javascript, "interpret", { candidate, files });
    assertInterpretationDocument(output);
    if (output.journey.sourceAgent !== this.manifest.sourceAgent || output.journey.nativeSessionId !== candidate.nativeSessionId) {
      throw new Error("Adapter Interpretation changed the candidate identity");
    }
    return output;
  }
}
