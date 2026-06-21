export type CsharpTypeofRuntimeKind = "string" | "number" | "boolean" | "bigint";

export const CsharpTargetOperatorOperation = {
  typeTest: "type-test",
  jsStringCodeUnit: "js-string-code-unit",
} as const;

export type CsharpTargetOperatorOperation = typeof CsharpTargetOperatorOperation[keyof typeof CsharpTargetOperatorOperation];

const typeofRuntimePrefix = "typeof-runtime:";
const typeofComparisonPrefix = "typeof-comparison:";

export function csharpTypeofRuntimeOperation(kind: CsharpTypeofRuntimeKind): string {
  return `${typeofRuntimePrefix}${kind}`;
}

export function getCsharpTypeofRuntimeKind(operation: string): CsharpTypeofRuntimeKind | undefined {
  return getCsharpRuntimeKind(operation, typeofRuntimePrefix);
}

export function csharpTypeofComparisonOperation(kind: CsharpTypeofRuntimeKind, negated: boolean): string {
  return `${typeofComparisonPrefix}${negated ? "not:" : "is:"}${kind}`;
}

export function getCsharpTypeofComparisonOperation(operation: string): { readonly kind: CsharpTypeofRuntimeKind; readonly negated: boolean } | undefined {
  const positiveKind = getCsharpRuntimeKind(operation, `${typeofComparisonPrefix}is:`);
  if (positiveKind !== undefined) {
    return { kind: positiveKind, negated: false };
  }
  const negativeKind = getCsharpRuntimeKind(operation, `${typeofComparisonPrefix}not:`);
  return negativeKind === undefined
    ? undefined
    : { kind: negativeKind, negated: true };
}

function getCsharpRuntimeKind(operation: string, prefix: string): CsharpTypeofRuntimeKind | undefined {
  if (!operation.startsWith(prefix)) {
    return undefined;
  }
  const kind = operation.slice(prefix.length);
  return kind === "string" || kind === "number" || kind === "boolean" || kind === "bigint"
    ? kind
    : undefined;
}
