import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PluginPackageDocument } from "@agentjourney/contracts";
import { withPluginIntegrity } from "@agentjourney/plugin-runtime";

const directory = process.argv[2] ? path.resolve(process.argv[2]) : undefined;
if (!directory) {
  console.error("Usage: pnpm plugin:pack <plugin-directory>");
  process.exit(1);
}
const manifest = JSON.parse(await readFile(path.join(directory, "plugin.manifest.json"), "utf8")) as PluginPackageDocument["manifest"];
let css: string | undefined;
let javascript: string | undefined;
const assets: NonNullable<PluginPackageDocument["assets"]> = [];
try { css = await readFile(path.join(directory, "style.css"), "utf8"); } catch {}
for (const candidate of ["dist/index.global.js", "dist/index.js", "dist/index.global.cjs", "dist/index.cjs"]) {
  try { javascript = await readFile(path.join(directory, candidate), "utf8"); break; } catch {}
}
const mediaTypes: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".avif": "image/avif" };
const visitAssets = async (assetDirectory: string): Promise<void> => {
  try {
    for (const entry of await readdir(assetDirectory, { withFileTypes: true })) {
      const absolute = path.join(assetDirectory, entry.name);
      if (entry.isDirectory()) await visitAssets(absolute);
      else if (entry.isFile()) {
        const mediaType = mediaTypes[path.extname(entry.name).toLowerCase()];
        if (!mediaType) throw new Error(`Unsupported asset type: ${entry.name}`);
        const bytes = await readFile(absolute);
        assets.push({
          path: path.relative(path.join(directory, "assets"), absolute).split(path.sep).join("/"),
          mediaType,
          base64: bytes.toString("base64")
        });
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
};
await visitAssets(path.join(directory, "assets"));
const content = {
  formatVersion: 1 as const,
  manifest,
  ...(css ? { css } : {}),
  ...(javascript ? { javascript } : {}),
  ...(assets.length > 0 ? { assets } : {})
};
const document = withPluginIntegrity(content);
const destination = path.join(directory, `${manifest.id}.agentjourney-plugin`);
await writeFile(destination, `${JSON.stringify(document, null, 2)}\n`, { mode: 0o600 });
console.log(destination);
