import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MemorySource } from "@agentjourney/plugin-sdk/testing";
import { assertRendererTreeDocument } from "@agentjourney/contracts/validate";
import { PluginRegistry, SandboxedSourceAdapter, evaluateAdapterMethod, evaluateRenderer, withPluginIntegrity } from "../src/index.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

const rendererPackage = () => withPluginIntegrity({
  formatVersion: 1,
  manifest: {
    type: "renderer",
    id: "example.renderer",
    version: "1.0.0",
    displayName: "Example Renderer",
    interfaceVersion: "^1.0.0",
    kind: "style-pack"
  },
  css: ":root { --stage-accent: #ff00aa; }"
});

const adapterJavascript = `
globalThis.agentJourneyAdapter = {
  discover(input) {
    return input.files.map(file => ({ sourceAgent: "example-agent", nativeSessionId: file.path, relativePaths: [file.path], locator: { mainPath: file.path } }));
  },
  interpret(input) {
    const file = input.files[0];
    return {
      schemaVersion: "1.0.0",
      adapter: { id: "example.adapter", version: "1.0.0" },
      journey: { sourceAgent: "example-agent", nativeSessionId: input.candidate.nativeSessionId },
      activities: [{ id: "a1", kind: "agent-output", evidenceAnchor: file.path + "#L1", threadId: "main", sourceOrder: 1, text: file.text }],
      threads: [{ id: "main" }],
      coverage: { sourceRecordCount: 1, dispositions: [{ evidenceAnchor: file.path + "#L1", disposition: "canonical", activityIds: ["a1"] }], missing: [] },
      fidelity: { contentKinds: ["agent-output"], timedKinds: [], deliveryTraces: false, agentThreads: false, causalLinks: false, terminalStream: false, knownGaps: [] }
    };
  }
};
`;

function adapterPackage() {
  return withPluginIntegrity({
    formatVersion: 1,
    manifest: {
      type: "source-adapter",
      id: "example.adapter",
      version: "1.0.0",
      displayName: "Example Adapter",
      interfaceVersion: "^1.0.0",
      sourceAgent: "example-agent",
      defaultRootSegments: { posix: [".example"], windows: [".example"] },
      discovery: { include: ["**/*.jsonl"] }
    },
    javascript: adapterJavascript
  });
}

describe("PluginRegistry", () => {
  it("installs integrity-checked inert Renderer packages", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "agentjourney-plugins-"));
    roots.push(root);
    const registry = new PluginRegistry(root);
    await registry.load();
    await registry.install(rendererPackage());
    expect(registry.renderers()[0]).toMatchObject({ manifest: { id: "example.renderer" }, builtIn: false });
  });

  it("accepts bounded package-local raster assets and rejects active asset types", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "agentjourney-plugins-"));
    roots.push(root);
    const registry = new PluginRegistry(root);
    await registry.load();
    const { integrity: _integrity, ...content } = rendererPackage();
    const withAsset = withPluginIntegrity({
      ...content,
      assets: [{ path: "pixel.png", mediaType: "image/png", base64: "iVBORw0KGgo=" }]
    });
    await registry.install(withAsset);
    expect(registry.renderers()[0]?.assets?.[0]?.path).toBe("pixel.png");
    const unsafe = withPluginIntegrity({
      ...content,
      assets: [{ path: "active.svg", mediaType: "image/svg+xml", base64: "PHN2Zz4=" }]
    });
    await expect(registry.install(unsafe)).rejects.toThrow(/media type/u);
  });

  it("loads an explicit local development directory without installing it", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "agentjourney-plugins-"));
    roots.push(root);
    const development = path.join(root, "dev-renderer");
    await mkdir(development, { recursive: true });
    const packageDocument = rendererPackage();
    await writeFile(path.join(development, "plugin.manifest.json"), JSON.stringify(packageDocument.manifest));
    await writeFile(path.join(development, "style.css"), packageDocument.css ?? "");
    const registry = new PluginRegistry(root, [development]);
    await registry.load();
    expect(registry.list()[0]).toMatchObject({ development: true, filePath: development });
  });

  it("keeps incompatible or invalid installed packages disabled with diagnostics", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "agentjourney-plugins-"));
    roots.push(root);
    const directory = path.join(root, "plugins");
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, "broken.agentjourney-plugin"), "{not json");
    const registry = new PluginRegistry(root);
    await registry.load();
    expect(registry.list()).toEqual([]);
    expect(registry.listDiagnostics()[0]).toMatchObject({ filePath: expect.stringContaining("broken.agentjourney-plugin") });
  });

  it("rejects tampering and executable Style Packs", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "agentjourney-plugins-"));
    roots.push(root);
    const registry = new PluginRegistry(root);
    await registry.load();
    const tampered = { ...rendererPackage(), css: "body { color: red }" };
    await expect(registry.install(tampered)).rejects.toThrow(/integrity/u);
    const { integrity: _integrity, ...rendererContent } = rendererPackage();
    const executable = withPluginIntegrity({ ...rendererContent, javascript: "alert(1)" });
    await expect(registry.install(executable)).rejects.toThrow(/Style Pack/u);
  });
});

describe("Renderer sandbox", () => {
  it("executes without browser or network globals and returns a declarative tree", async () => {
    const output = await evaluateRenderer(`
      globalThis.agentJourneyRenderer = {
        render(stage) {
          return { root: { tag: "h1", text: stage.title + ":" + typeof document + ":" + typeof fetch + ":" + typeof location } };
        }
      };
    `, { title: "Safe" });
    assertRendererTreeDocument(output);
    expect(output.root.text).toBe("Safe:undefined:undefined:undefined");
  });
});

describe("Source Adapter sandbox", () => {
  it("runs a TypeScript-authored JavaScript adapter without Node globals", async () => {
    const unavailable = await evaluateAdapterMethod(
      `globalThis.agentJourneyAdapter={discover(){return [{process:typeof process,require:typeof require,fetch:typeof fetch}]}}`,
      "discover",
      {}
    );
    expect(unavailable).toEqual([{ process: "undefined", require: "undefined", fetch: "undefined" }]);
  });

  it("discovers and interprets through the constrained adapter interface", async () => {
    const adapter = new SandboxedSourceAdapter(adapterPackage());
    const source = new MemorySource({ "sessions/example.jsonl": "hello from sandbox" });
    const [candidate] = await adapter.discover(source);
    const interpretation = await adapter.interpret(candidate!, source);
    expect(interpretation.activities[0]?.text).toBe("hello from sandbox");
  });

  it("interrupts runaway adapter code", async () => {
    await expect(
      evaluateAdapterMethod(`globalThis.agentJourneyAdapter={discover(){while(true){} }}`, "discover", {}, { timeoutMs: 20 })
    ).rejects.toThrow();
  });
});
