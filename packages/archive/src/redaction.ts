import type { JsonValue } from "@agentjourney/contracts";

export interface SensitiveMatch {
  kind: string;
  start: number;
  length: number;
}

const PATTERNS: Array<{ kind: string; pattern: RegExp }> = [
  { kind: "openai-style-key", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/gu },
  { kind: "github-token", pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/gu },
  { kind: "aws-access-key", pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/gu },
  { kind: "bearer-token", pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}\b/giu },
  {
    kind: "assigned-secret",
    pattern: /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password)\b\s*[:=]\s*["']?[^\s"']{12,}/giu
  }
];

export function detectSensitiveFindings(text: string): SensitiveMatch[] {
  const matches: SensitiveMatch[] = [];
  for (const { kind, pattern } of PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      if (match.index === undefined || !match[0]) continue;
      matches.push({ kind, start: match.index, length: match[0].length });
    }
  }
  matches.sort((left, right) => left.start - right.start || right.length - left.length);
  return matches.filter((candidate, index) => {
    const previous = matches[index - 1];
    return !previous || candidate.start >= previous.start + previous.length;
  });
}

function maskValue(value: string): string {
  if (value.length <= 8) return "•".repeat(value.length);
  return `${value.slice(0, 3)}${"•".repeat(Math.min(12, value.length - 6))}${value.slice(-3)}`;
}

export function maskSensitiveText(text: string, findings = detectSensitiveFindings(text)): string {
  if (findings.length === 0) return text;
  let output = "";
  let cursor = 0;
  for (const finding of findings) {
    if (finding.start < cursor) continue;
    output += text.slice(cursor, finding.start);
    output += maskValue(text.slice(finding.start, finding.start + finding.length));
    cursor = finding.start + finding.length;
  }
  return output + text.slice(cursor);
}

export function redactJsonValue(value: JsonValue): JsonValue {
  if (typeof value === "string") return maskSensitiveText(value);
  if (Array.isArray(value)) return value.map(redactJsonValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, redactJsonValue(child)]));
  }
  return value;
}
