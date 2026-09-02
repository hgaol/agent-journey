import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const [type, rawId] = process.argv.slice(2);
if ((type !== "renderer" && type !== "style-pack" && type !== "source-adapter") || !rawId || !/^[a-z0-9][a-z0-9._-]*$/u.test(rawId)) {
  console.error("Usage: pnpm plugin:create <style-pack|renderer|source-adapter> <lowercase.plugin-id>");
  process.exit(1);
}
const root = path.resolve("plugins", rawId);
await mkdir(path.join(root, "src"), { recursive: true });
const manifest = type === "renderer" || type === "style-pack"
  ? { type: "renderer", id: rawId, version: "1.0.0", displayName: rawId, interfaceVersion: "^1.0.0", kind: type }
  : { type, id: rawId, version: "1.0.0", displayName: rawId, interfaceVersion: "^1.0.0", sourceAgent: rawId, defaultRootSegments: { posix: [`.${rawId}`], windows: [`.${rawId}`] }, discovery: { include: ["**/*.jsonl"] } };
const source = type === "renderer"
  ? `globalThis.agentJourneyRenderer = {\n  render(stage) {\n    return {\n      root: {\n        tag: "main",\n        className: "custom-renderer",\n        children: [\n          { tag: "h1", text: stage.title ?? "Journey" },\n          ...stage.activities.map((activity) => ({\n            tag: "article",\n            text: activity.text ?? activity.nativeName ?? activity.kind,\n            intent: { type: "open-evidence", activityId: activity.id }\n          }))\n        ]\n      }\n    };\n  }\n};\n`
  : type === "source-adapter" ? `globalThis.agentJourneyAdapter = {\n  discover({ files }) {\n    return files.map((file) => ({ sourceAgent: ${JSON.stringify(rawId)}, nativeSessionId: file.path, relativePaths: [file.path], locator: { mainPath: file.path } }));\n  },\n  interpret({ candidate, files }) {\n    throw new Error("Implement interpretation for " + candidate.nativeSessionId);\n  }\n};\n` : "";
const buildInstructions = type === "style-pack"
  ? `pnpm plugin:pack plugins/${rawId}`
  : `pnpm exec tsup plugins/${rawId}/src/index.ts --format iife --global-name AgentJourneyPlugin --out-dir plugins/${rawId}/dist\npnpm plugin:pack plugins/${rawId}`;
await Promise.all([
  writeFile(path.join(root, "plugin.manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`),
  ...(source ? [writeFile(path.join(root, "src", "index.ts"), source)] : []),
  writeFile(path.join(root, "style.css"), ":root { --stage-accent: #7dd3fc; }\n"),
  writeFile(path.join(root, "README.md"), `# ${rawId}\n\nBuild and package:\n\n\`\`\`bash\n${buildInstructions}\npnpm plugin:check plugins/${rawId}/${rawId}.agentjourney-plugin\n\`\`\`\n`)
]);
console.log(`Created ${path.relative(process.cwd(), root)}`);
