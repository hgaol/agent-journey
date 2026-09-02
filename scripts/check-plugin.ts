import { readFile } from "node:fs/promises";
import path from "node:path";
import { assertPluginPackageDocument } from "@agentjourney/contracts/validate";
import { evaluateAdapterMethod, verifyPluginIntegrity } from "@agentjourney/plugin-runtime";
import { assertRendererConformance } from "@agentjourney/plugin-sdk/testing";

const filePath = process.argv[2] ? path.resolve(process.argv[2]) : undefined;
if (!filePath) {
  console.error("Usage: pnpm plugin:check <package.agentjourney-plugin>");
  process.exit(1);
}
const value: unknown = JSON.parse(await readFile(filePath, "utf8"));
assertPluginPackageDocument(value);
if (!verifyPluginIntegrity(value)) throw new Error("Plugin integrity check failed");
if (value.manifest.type === "source-adapter") {
  if (!value.javascript) throw new Error("Source Adapter has no JavaScript");
  const result = await evaluateAdapterMethod(value.javascript, "discover", { files: [] });
  if (!Array.isArray(result)) throw new Error("discover() did not return an array");
} else {
  assertRendererConformance({
    manifest: {
      id: value.manifest.id,
      version: value.manifest.version,
      displayName: value.manifest.displayName,
      interfaceVersion: value.manifest.interfaceVersion,
      kind: value.manifest.kind,
      ...(value.manifest.targetSourceAgent ? { targetSourceAgent: value.manifest.targetSourceAgent } : {}),
      ...(value.manifest.targetAgentVersions ? { targetAgentVersions: value.manifest.targetAgentVersions } : {})
    },
    css: value.css ?? "",
    ...(value.javascript ? { javascript: value.javascript } : {})
  });
}
console.log(`${value.manifest.id}@${value.manifest.version}: valid ${value.manifest.type} package`);
