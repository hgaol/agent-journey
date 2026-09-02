import { createHash } from "node:crypto";
import type { PluginPackageDocument } from "@agentjourney/contracts";

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
}

export function pluginIntegrity(input: Omit<PluginPackageDocument, "integrity">): string {
  return `sha256-${createHash("sha256").update(canonical(input)).digest("base64url")}`;
}

export function withPluginIntegrity(input: Omit<PluginPackageDocument, "integrity">): PluginPackageDocument {
  return { ...input, integrity: pluginIntegrity(input) } as PluginPackageDocument;
}

export function verifyPluginIntegrity(document: PluginPackageDocument): boolean {
  const { integrity, ...content } = document;
  return integrity === pluginIntegrity(content as Omit<PluginPackageDocument, "integrity">);
}
