import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { compileFromFile } from "json-schema-to-typescript";

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, "..");
const schemaPath = path.join(packageRoot, "schema", "contracts.schema.json");
const outputDir = path.join(packageRoot, "src", "generated");
const outputPath = path.join(outputDir, "contracts.ts");

const source = await compileFromFile(schemaPath, {
  bannerComment: "/* Generated from schema/contracts.schema.json. Do not edit. */",
  cwd: path.dirname(schemaPath),
  style: {
    semi: true,
    singleQuote: false,
    trailingComma: "all"
  }
});

await mkdir(outputDir, { recursive: true });
await writeFile(outputPath, source, "utf8");
console.log(`generated ${path.relative(process.cwd(), outputPath)}`);
