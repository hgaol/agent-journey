import { chmod, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import semver from "semver";
import type { PluginPackageDocument } from "@agentjourney/contracts";
import { assertPluginPackageDocument } from "@agentjourney/contracts/validate";
import type { RendererPlugin } from "@agentjourney/plugin-sdk";
import { verifyPluginIntegrity, withPluginIntegrity } from "./integrity.js";

export const RENDERER_INTERFACE_VERSION = "1.0.0";
export const ADAPTER_INTERFACE_VERSION = "1.0.0";

export interface PluginDiagnostic {
  filePath: string;
  message: string;
}

export interface InstalledPlugin {
  document: PluginPackageDocument;
  installedAt: string;
  filePath: string;
  development: boolean;
}

function safeFilePart(value: string): string {
  if (!/^[a-z0-9][a-z0-9._-]*$/u.test(value)) throw new Error(`Unsafe plugin identifier: ${value}`);
  return value;
}

function validateCss(css: string): void {
  if (/@import\b|url\s*\(\s*["']?\s*(?:https?:|\/\/)|expression\s*\(|-moz-binding/iu.test(css)) {
    throw new Error("Plugin CSS contains external or executable constructs");
  }
}

export class PluginRegistry {
  private readonly directory: string;
  private installed: InstalledPlugin[] = [];
  private diagnostics: PluginDiagnostic[] = [];

  constructor(dataDirectory: string, private readonly developmentDirectories: readonly string[] = []) {
    this.directory = path.join(dataDirectory, "plugins");
  }

  async load(): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const loaded: InstalledPlugin[] = [];
    const diagnostics: PluginDiagnostic[] = [];
    for (const entry of await readdir(this.directory, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".agentjourney-plugin")) continue;
      const filePath = path.join(this.directory, entry.name);
      try {
        const document: unknown = JSON.parse(await readFile(filePath, "utf8"));
        this.validate(document);
        const metadata = await import("node:fs/promises").then(({ stat }) => stat(filePath));
        loaded.push({ document, installedAt: metadata.mtime.toISOString(), filePath, development: false });
      } catch (error) {
        diagnostics.push({
          filePath,
          message: error instanceof Error ? error.message : "invalid plugin package"
        });
      }
    }
    for (const directory of this.developmentDirectories) {
      try {
        loaded.push(await this.loadDevelopmentPackage(path.resolve(directory)));
      } catch (error) {
        diagnostics.push({
          filePath: path.resolve(directory),
          message: error instanceof Error ? error.message : "invalid development plugin"
        });
      }
    }
    this.installed = loaded;
    this.diagnostics = diagnostics;
  }

  list(): readonly InstalledPlugin[] {
    return this.installed;
  }

  listDiagnostics(): readonly PluginDiagnostic[] {
    return this.diagnostics;
  }

  renderers(): RendererPlugin[] {
    return this.latestById("renderer").map(({ document }) => {
      const manifest = document.manifest;
      if (manifest.type !== "renderer") throw new Error("registry type mismatch");
      return {
        manifest: {
          id: manifest.id,
          version: manifest.version,
          displayName: manifest.displayName,
          interfaceVersion: manifest.interfaceVersion,
          kind: manifest.kind,
          ...(manifest.targetSourceAgent ? { targetSourceAgent: manifest.targetSourceAgent } : {}),
          ...(manifest.targetAgentVersions ? { targetAgentVersions: manifest.targetAgentVersions } : {})
        },
        css: document.css ?? "",
        ...(document.javascript ? { executable: true } : {}),
        ...(document.assets ? { assets: document.assets } : {}),
        integrity: document.integrity,
        builtIn: false
      };
    });
  }

  rendererPackage(id: string): PluginPackageDocument | undefined {
    return this.latestById("renderer").find(({ document }) => document.manifest.id === id)?.document;
  }

  sourceAdapterPackages(): PluginPackageDocument[] {
    return this.latestById("source-adapter").map(({ document }) => document);
  }

  async install(value: unknown): Promise<InstalledPlugin> {
    this.validate(value);
    const manifest = value.manifest;
    const fileName = `${safeFilePart(manifest.id)}@${safeFilePart(manifest.version.replaceAll("+", "_"))}.agentjourney-plugin`;
    const filePath = path.join(this.directory, fileName);
    const temporary = `${filePath}.${process.pid}.tmp`;
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    try {
      await rename(temporary, filePath);
    } catch (error) {
      if (process.platform !== "win32") throw error;
      await rm(filePath, { force: true });
      await rename(temporary, filePath);
    }
    if (process.platform !== "win32") await chmod(filePath, 0o600);
    const installed = { document: value, installedAt: new Date().toISOString(), filePath, development: false };
    this.installed = [...this.installed.filter((item) => item.filePath !== filePath), installed];
    return installed;
  }

  private async loadDevelopmentPackage(directory: string): Promise<InstalledPlugin> {
    const manifest = JSON.parse(await readFile(path.join(directory, "plugin.manifest.json"), "utf8")) as PluginPackageDocument["manifest"];
    let css: string | undefined;
    let javascript: string | undefined;
    try { css = await readFile(path.join(directory, "style.css"), "utf8"); } catch {}
    for (const candidate of ["dist/index.global.js", "dist/index.js", "dist/index.global.cjs", "dist/index.cjs"]) {
      try { javascript = await readFile(path.join(directory, candidate), "utf8"); break; } catch {}
    }
    const assets: Array<{ path: string; mediaType: string; base64: string }> = [];
    const assetRoot = path.join(directory, "assets");
    const mediaTypes: Record<string, string> = {
      ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
      ".gif": "image/gif", ".webp": "image/webp", ".avif": "image/avif"
    };
    const visit = async (current: string): Promise<void> => {
      try {
        for (const entry of await readdir(current, { withFileTypes: true })) {
          const absolute = path.join(current, entry.name);
          if (entry.isDirectory()) await visit(absolute);
          else if (entry.isFile()) {
            const mediaType = mediaTypes[path.extname(entry.name).toLowerCase()];
            if (!mediaType) throw new Error(`Unsupported development asset: ${entry.name}`);
            assets.push({
              path: path.relative(assetRoot, absolute).split(path.sep).join("/"),
              mediaType,
              base64: (await readFile(absolute)).toString("base64")
            });
          }
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    };
    await visit(assetRoot);
    const document = withPluginIntegrity({
      formatVersion: 1,
      manifest,
      ...(css ? { css } : {}),
      ...(javascript ? { javascript } : {}),
      ...(assets.length > 0 ? { assets } : {})
    });
    this.validate(document);
    return { document, installedAt: new Date().toISOString(), filePath: directory, development: true };
  }

  private latestById(type: "renderer" | "source-adapter"): InstalledPlugin[] {
    const byId = new Map<string, InstalledPlugin>();
    for (const plugin of this.installed.filter(({ document }) => document.manifest.type === type)) {
      const existing = byId.get(plugin.document.manifest.id);
      if (!existing || semver.gt(plugin.document.manifest.version, existing.document.manifest.version)) {
        byId.set(plugin.document.manifest.id, plugin);
      }
    }
    return [...byId.values()];
  }

  private validate(value: unknown): asserts value is PluginPackageDocument {
    assertPluginPackageDocument(value);
    if (!verifyPluginIntegrity(value)) throw new Error("Plugin integrity check failed");
    const manifest = value.manifest;
    if (!semver.valid(manifest.version)) throw new Error(`Invalid plugin version: ${manifest.version}`);
    if (!semver.validRange(manifest.interfaceVersion)) throw new Error(`Invalid interface range: ${manifest.interfaceVersion}`);
    if (manifest.type === "renderer" && manifest.targetAgentVersions && !semver.validRange(manifest.targetAgentVersions)) {
      throw new Error(`Invalid target agent version range: ${manifest.targetAgentVersions}`);
    }
    const hostVersion = manifest.type === "renderer" ? RENDERER_INTERFACE_VERSION : ADAPTER_INTERFACE_VERSION;
    if (!semver.satisfies(hostVersion, manifest.interfaceVersion, { includePrerelease: true })) {
      throw new Error(`Plugin requires interface ${manifest.interfaceVersion}; host provides ${hostVersion}`);
    }
    if (value.css) validateCss(value.css);
    if (manifest.type === "renderer" && manifest.kind === "style-pack" && value.javascript) {
      throw new Error("A Style Pack cannot contain executable JavaScript");
    }
    if (value.assets) {
      if (manifest.type !== "renderer") throw new Error("Only Renderer packages may contain static assets");
      let totalAssetBytes = 0;
      for (const asset of value.assets) {
        if (!asset.path || asset.path.startsWith("/") || asset.path.includes("\\") || asset.path.split("/").includes("..")) {
          throw new Error(`Unsafe plugin asset path: ${asset.path}`);
        }
        if (!/^image\/(?:png|jpeg|gif|webp|avif)$/u.test(asset.mediaType)) {
          throw new Error(`Unsupported plugin asset media type: ${asset.mediaType}`);
        }
        const size = Buffer.byteLength(asset.base64, "base64");
        if (size > 5 * 1024 * 1024) throw new Error(`Plugin asset is larger than 5 MB: ${asset.path}`);
        totalAssetBytes += size;
      }
      if (totalAssetBytes > 20 * 1024 * 1024) throw new Error("Plugin assets exceed the 20 MB package limit");
    }
    if (manifest.type === "source-adapter" && !value.javascript) {
      throw new Error("A Source Adapter package requires precompiled JavaScript");
    }
  }
}
