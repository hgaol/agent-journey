import os from "node:os";
import path from "node:path";
import { builtInAdapters } from "@agentjourney/builtin-adapters";
import { assertInterpretationDocument } from "@agentjourney/contracts/validate";
import { CapturedBundle, FilesystemSource } from "../apps/host/src/filesystem-source.js";

for (const adapter of builtInAdapters) {
  const segments = process.platform === "win32"
    ? adapter.manifest.defaultRootSegments.windows
    : adapter.manifest.defaultRootSegments.posix;
  const root = path.join(os.homedir(), ...segments);
  try {
    const source = await FilesystemSource.open(root);
    const candidates = await adapter.discover(source);
    const candidate = candidates[0];
    if (!candidate) {
      console.log(`${adapter.manifest.displayName}: no candidates in ${root}`);
      continue;
    }
    const bundle = await CapturedBundle.fromSource(source, candidate.relativePaths);
    const interpretation = await adapter.interpret(candidate, bundle);
    assertInterpretationDocument(interpretation);
    const dispositions: Record<string, number> = {};
    for (const item of interpretation.coverage.dispositions) {
      dispositions[item.disposition] = (dispositions[item.disposition] ?? 0) + 1;
    }
    console.log(
      `${adapter.manifest.displayName}: ${candidates.length} candidate(s), latest ${interpretation.activities.length} activities / ${interpretation.coverage.sourceRecordCount} records`,
      dispositions
    );
  } catch (error) {
    console.error(`${adapter.manifest.displayName}: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
