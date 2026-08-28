import type { DotnetProviderDiagnostic } from "../../provider.js";

export const supportedPassingModes = new Set([
  "by-value",
  "byref-readonly",
  "byref-readwrite",
  "byref-writeonly-must-init",
]);

export const supportedReturnPassingModes = new Set([
  "byref-readonly",
  "byref-readwrite",
]);

export const supportedTypeParameterVariance = new Set([
  "in",
  "out",
  "invariant",
  "target-defined",
]);

export const supportedDotnetExportKinds = new Set([
  "type",
  "function",
  "value",
  "namespace",
]);

export const supportedDotnetTypeKinds = new Set([
  "class",
  "struct",
  "interface",
  "enum",
  "delegate",
  "opaque",
]);

export const supportedDotnetMemberKinds = new Set([
  "constructor",
  "method",
  "property",
  "field",
  "indexer",
  "event",
  "operator",
]);

export const supportedDotnetConversionOperatorNames = new Set([
  "op_Implicit",
  "op_Explicit",
]);

export const supportedDotnetConversionKinds = new Set([
  "implicit",
  "explicit",
]);

export const supportedDotnetConstraintKinds = new Set([
  "implements",
  "value-type",
  "reference-type",
  "constructible",
  "unmanaged",
  "not-null",
  "target-specific",
]);

export const supportedDotnetTypeRefKinds = new Set([
  "void",
  "any",
  "unknown",
  "undefined",
  "object",
  "string",
  "literal",
  "boolean",
  "number",
  "bigint",
  "source-primitive",
  "type-parameter",
  "provider-ref",
  "named",
  "nullable",
  "nullable-reference",
  "array",
  "tuple",
  "union",
  "function",
  "pointer",
  "function-pointer",
  "opaque",
]);

export const supportedDotnetRenderShapeKinds = new Set([
  "named",
]);

export const dotnetTypeRefFieldsByKind = new Map<string, ReadonlySet<string>>([
  ["void", new Set(["kind"])],
  ["any", new Set(["kind"])],
  ["unknown", new Set(["kind"])],
  ["undefined", new Set(["kind"])],
  ["object", new Set(["kind"])],
  ["string", new Set(["kind"])],
  ["literal", new Set(["kind", "value"])],
  ["boolean", new Set(["kind"])],
  ["number", new Set(["kind"])],
  ["bigint", new Set(["kind"])],
  ["source-primitive", new Set(["kind", "name"])],
  ["type-parameter", new Set(["kind", "name"])],
  ["provider-ref", new Set(["kind", "moduleSpecifier", "exportName", "typeArguments"])],
  ["named", new Set(["kind", "targetId", "metadataName", "displayName", "renderShape", "typeArguments", "sourceShape", "implicitArrayInput"])],
  ["nullable", new Set(["kind", "elementType"])],
  ["nullable-reference", new Set(["kind", "elementType"])],
  ["array", new Set(["kind", "elementType", "rank"])],
  ["tuple", new Set(["kind", "elements"])],
  ["union", new Set(["kind", "types"])],
  ["function", new Set(["kind", "id", "parameters", "returnType", "targetReturnType", "returnPassing", "typeParameters"])],
  ["pointer", new Set(["kind", "pointee", "mutability"])],
  ["function-pointer", new Set(["kind", "args", "result", "abi"])],
  ["opaque", new Set(["kind", "id", "displayName", "sourceShape"])],
]);

export const dotnetSignatureFields = new Set([
  "id",
  "sourceId",
  "targetName",
  "attributes",
  "unsupportedAttributes",
  "typeParameters",
  "sourceTypeParameters",
  "sourceTypeParameterRoles",
  "parameters",
  "returnType",
  "targetReturnType",
  "returnPassing",
  "returnAttributes",
  "unsupportedReturnAttributes",
  "targetInvocation",
]);

export interface ContractCollector {
  readonly add: (path: string, message: string, value?: unknown) => void;
  readonly diagnostic: () => DotnetProviderDiagnostic | undefined;
}

export function createContractCollector(code: string, message: string): ContractCollector {
  const evidence: Readonly<Record<string, unknown>>[] = [];
  return {
    add(path, failure, value) {
      evidence.push({
        path,
        failure,
        ...(value !== undefined ? { value: summarizeContractValue(value) } : {}),
      });
    },
    diagnostic() {
      return evidence.length === 0
        ? undefined
        : {
            code,
            message,
            evidence,
          };
    },
  };
}

export function stringProperty(record: Readonly<Record<string, unknown>>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function requireSupportedDiscriminant(
  value: unknown,
  path: string,
  collector: ContractCollector,
  description: string,
  supported: ReadonlySet<string>,
): boolean {
  if (typeof value !== "string" || !supported.has(value)) {
    collector.add(path, `Unsupported ${description}.`, value);
    return false;
  }
  return true;
}

export function requireNonEmptyString(value: string | undefined, path: string, collector: ContractCollector): void {
  if (typeof value !== "string" || value.length === 0) {
    collector.add(path, "Expected a non-empty string.", value);
  }
}

export function requireString(value: unknown, path: string, collector: ContractCollector): void {
  if (typeof value !== "string") {
    collector.add(path, "Expected a string.", value);
  }
}

export function requireOptionalNonEmptyString(value: unknown, path: string, collector: ContractCollector): void {
  if (value !== undefined && (typeof value !== "string" || value.length === 0)) {
    collector.add(path, "Expected an omitted value or a non-empty string.", value);
  }
}

export function requireUnique(values: Set<string>, value: string | undefined, path: string, collector: ContractCollector): void {
  if (typeof value !== "string" || value.length === 0) {
    return;
  }
  if (values.has(value)) {
    collector.add(path, "Duplicate identity in provider contract.", value);
    return;
  }
  values.add(value);
}

function summarizeContractValue(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return { kind: "array", length: value.length };
  }
  const record = value as Readonly<Record<string, unknown>>;
  const summary: Record<string, string> = {};
  for (const key of contractSummaryStringKeys) {
    const fieldValue = record[key];
    if (typeof fieldValue === "string") {
      summary[key] = fieldValue;
    }
  }
  return summary;
}

const contractSummaryStringKeys = [
  "kind",
  "id",
  "sourceName",
  "targetId",
  "metadataName",
] as const;
