import Ajv2020, { type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import schema from "../schema/contracts.schema.json" with { type: "json" };
import type {
  InterpretationDocument,
  JourneyPackageManifestDocument,
  PluginPackageDocument,
  RendererTreeDocument,
  StageDocument
} from "./generated/contracts.js";

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
ajv.addSchema(schema);

const schemaId = schema.$id;
const interpretationValidator = ajv.compile({
  $ref: `${schemaId}#/$defs/InterpretationDocument`
});
const stageValidator = ajv.compile({
  $ref: `${schemaId}#/$defs/StageDocument`
});
const pluginPackageValidator = ajv.compile({
  $ref: `${schemaId}#/$defs/PluginPackageDocument`
});
const journeyPackageManifestValidator = ajv.compile({
  $ref: `${schemaId}#/$defs/JourneyPackageManifestDocument`
});
const rendererTreeValidator = ajv.compile({
  $ref: `${schemaId}#/$defs/RendererTreeDocument`
});

export class ContractValidationError extends Error {
  readonly errors: ErrorObject[];

  constructor(documentName: string, errors: ErrorObject[] | null | undefined) {
    const detail = errors
      ?.map((error) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`)
      .join("; ");
    super(`${documentName} failed contract validation${detail ? `: ${detail}` : ""}`);
    this.name = "ContractValidationError";
    this.errors = errors ?? [];
  }
}

function assertWith<T>(
  documentName: string,
  validator: ValidateFunction,
  value: unknown
): asserts value is T {
  if (!validator(value)) {
    throw new ContractValidationError(documentName, validator.errors);
  }
}

export function assertInterpretationDocument(
  value: unknown
): asserts value is InterpretationDocument {
  assertWith<InterpretationDocument>("InterpretationDocument", interpretationValidator, value);
}

export function assertStageDocument(value: unknown): asserts value is StageDocument {
  assertWith<StageDocument>("StageDocument", stageValidator, value);
}

export function assertPluginPackageDocument(value: unknown): asserts value is PluginPackageDocument {
  assertWith<PluginPackageDocument>("PluginPackageDocument", pluginPackageValidator, value);
}

export function assertRendererTreeDocument(value: unknown): asserts value is RendererTreeDocument {
  assertWith<RendererTreeDocument>("RendererTreeDocument", rendererTreeValidator, value);
}

export function assertJourneyPackageManifestDocument(
  value: unknown
): asserts value is JourneyPackageManifestDocument {
  assertWith<JourneyPackageManifestDocument>(
    "JourneyPackageManifestDocument",
    journeyPackageManifestValidator,
    value
  );
}
