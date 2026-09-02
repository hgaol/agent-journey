import { getQuickJS } from "quickjs-emscripten";

export class AdapterSandboxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdapterSandboxError";
  }
}

async function evaluatePluginMethod(
  javascript: string,
  registrationName: "agentJourneyAdapter" | "agentJourneyRenderer",
  method: string,
  input: unknown,
  options: { timeoutMs?: number; memoryBytes?: number } = {}
): Promise<unknown> {
  const QuickJS = await getQuickJS();
  const runtime = QuickJS.newRuntime();
  runtime.setMemoryLimit(options.memoryBytes ?? 64 * 1024 * 1024);
  runtime.setMaxStackSize(2 * 1024 * 1024);
  const deadline = Date.now() + (options.timeoutMs ?? 2_000);
  runtime.setInterruptHandler(() => Date.now() > deadline);
  const context = runtime.newContext();
  try {
    const inputJson = JSON.stringify(input);
    const code = `
"use strict";
${javascript}
;
(() => {
  const plugin = globalThis[${JSON.stringify(registrationName)}];
  if (!plugin || typeof plugin[${JSON.stringify(method)}] !== "function") {
    throw new Error("Plugin did not register ${registrationName}.${method}");
  }
  const output = plugin[${JSON.stringify(method)}](JSON.parse(${JSON.stringify(inputJson)}));
  if (output && typeof output.then === "function") throw new Error("Plugin methods must be synchronous");
  return JSON.stringify(output);
})()
`;
    const result = context.evalCode(code, "agentjourney-plugin.js");
    if (result.error) {
      const dumped = context.dump(result.error);
      result.error.dispose();
      throw new AdapterSandboxError(
        typeof dumped === "object" && dumped && "message" in dumped ? String(dumped.message) : String(dumped)
      );
    }
    const serialized = context.dump(result.value);
    result.value.dispose();
    if (typeof serialized !== "string") throw new AdapterSandboxError("Plugin result was not serializable");
    return JSON.parse(serialized) as unknown;
  } finally {
    context.dispose();
    runtime.dispose();
  }
}

export function evaluateAdapterMethod(
  javascript: string,
  method: "discover" | "interpret",
  input: unknown,
  options: { timeoutMs?: number; memoryBytes?: number } = {}
): Promise<unknown> {
  return evaluatePluginMethod(javascript, "agentJourneyAdapter", method, input, options);
}

export function evaluateRenderer(
  javascript: string,
  stageDocument: unknown,
  options: { timeoutMs?: number; memoryBytes?: number } = {}
): Promise<unknown> {
  return evaluatePluginMethod(javascript, "agentJourneyRenderer", "render", stageDocument, options);
}
