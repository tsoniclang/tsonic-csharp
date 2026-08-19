import { requireNonEmptyString, requireOptionalNonEmptyString, requireString, requireSupportedDiscriminant, supportedDotnetRenderShapeKinds } from "./support.js";
import type {
  DotnetAssemblyReference,
  DotnetConversionOperatorDeclaration,
  DotnetMemberDeclaration,
  DotnetParameterDefaultValue,
  DotnetUnsupportedDefaultValueDeclaration,
  DotnetUnsupportedMemberDeclaration,
} from "../index.js";
import type { ContractCollector } from "./support.js";
import type { DotnetRenderShape } from "../types.js";

export function validateOptionalDotnetAssemblyReference(
  reference: DotnetAssemblyReference | undefined,
  path: string,
  collector: ContractCollector,
): void {
  if (reference !== undefined) {
    validateDotnetAssemblyReference(reference, path, collector);
  }
}

export function validateDotnetAssemblyReference(
  reference: DotnetAssemblyReference,
  path: string,
  collector: ContractCollector,
): void {
  if (reference === null || typeof reference !== "object") {
    collector.add(path, "Assembly reference must be an object.", reference);
    return;
  }
  const record = reference as unknown as Readonly<Record<string, unknown>>;
  requireNonEmptyString(record.name as string | undefined, `${path}.name`, collector);
  requireOptionalNonEmptyString(record.version, `${path}.version`, collector);
  requireOptionalNonEmptyString(record.publicKeyToken, `${path}.publicKeyToken`, collector);
  requireOptionalNonEmptyString(record.culture, `${path}.culture`, collector);
  requireOptionalNonEmptyString(record.path, `${path}.path`, collector);
}

export function validateOptionalDotnetRenderShape(
  shape: DotnetRenderShape | undefined,
  path: string,
  collector: ContractCollector,
): void {
  if (shape === undefined) {
    return;
  }
  requireSupportedDiscriminant(
    (shape as unknown as Readonly<Record<string, unknown>>).kind,
    `${path}.kind`,
    collector,
    ".NET render shape kind",
    supportedDotnetRenderShapeKinds,
  );
  requireNonEmptyString(shape.name, `${path}.name`, collector);
  validateOptionalNonNegativeInteger(shape.genericArity, `${path}.genericArity`, collector);
  for (const [index, namespacePart] of (shape.namespace ?? []).entries()) {
    requireNonEmptyString(namespacePart, `${path}.namespace[${index}]`, collector);
  }
  for (const [index, nested] of (shape.nested ?? []).entries()) {
    requireNonEmptyString(nested.name, `${path}.nested[${index}].name`, collector);
    validateOptionalNonNegativeInteger(nested.genericArity, `${path}.nested[${index}].genericArity`, collector);
  }
}

function validateOptionalNonNegativeInteger(
  value: number | undefined,
  path: string,
  collector: ContractCollector,
): void {
  if (value === undefined) {
    return;
  }
  if (!Number.isInteger(value) || value < 0) {
    collector.add(path, "Value must be a non-negative integer.", value);
  }
}

export function validateDotnetTargetIdentity(
  targetId: string | undefined,
  metadataName: string | undefined,
  targetPath: string,
  metadataPath: string,
  collector: ContractCollector,
  options: { readonly assembly?: DotnetAssemblyReference } = {},
): void {
  requireNonEmptyString(targetId, targetPath, collector);
  requireNonEmptyString(metadataName, metadataPath, collector);
  if (typeof targetId !== "string" || targetId.length === 0) {
    return;
  }
  if (typeof metadataName === "string" && metadataName.length > 0 && targetId === metadataName) {
    collector.add(targetPath, "Target identity must not fall back to metadataName; it must carry a provider-qualified target id.", targetId);
  }
  const assemblySeparator = targetId.indexOf("::");
  if (assemblySeparator >= 0 && (assemblySeparator === 0 || assemblySeparator === targetId.length - 2)) {
    collector.add(targetPath, "Assembly-qualified target identity must include both assembly identity and metadata identity.", targetId);
  }
  if (options.assembly !== undefined && assemblySeparator < 0) {
    collector.add(targetPath, "Assembly-backed target identity must include an assembly qualifier.", targetId);
  }
  const expectedAssemblyName = options.assembly?.name;
  if (typeof expectedAssemblyName === "string" && expectedAssemblyName.length > 0 && assemblySeparator > 0) {
    const actualAssemblyName = targetId.slice(0, assemblySeparator).split(",")[0] ?? "";
    if (actualAssemblyName !== expectedAssemblyName) {
      collector.add(targetPath, "Assembly-qualified target identity must agree with the assembly reference name.", targetId);
    }
  }
}

export function validateOptionalDotnetParameterDefaultValue(
  value: DotnetParameterDefaultValue | undefined,
  path: string,
  collector: ContractCollector,
): void {
  if (value === undefined) {
    return;
  }
  switch (value.kind) {
    case "null":
      return;
    case "string":
      requireString(value.value, `${path}.value`, collector);
      return;
    case "source-primitive":
      requireNonEmptyString(value.name, `${path}.name`, collector);
      if (typeof value.value !== "string" && typeof value.value !== "boolean") {
        collector.add(`${path}.value`, "Source primitive default values must be deterministic strings or booleans.", value.value);
      }
      return;
    case "enum":
      requireNonEmptyString(value.value, `${path}.value`, collector);
      requireOptionalNonEmptyString(value.fieldName, `${path}.fieldName`, collector);
      return;
  }
}

export function validateOptionalDotnetUnsupportedDefaultValue(
  value: DotnetUnsupportedDefaultValueDeclaration | undefined,
  path: string,
  collector: ContractCollector,
): void {
  if (value === undefined) {
    return;
  }
  requireNonEmptyString(value.id, `${path}.id`, collector);
  requireNonEmptyString(value.parameterName, `${path}.parameterName`, collector);
  requireNonEmptyString(value.reason, `${path}.reason`, collector);
  for (const [index, evidence] of (value.evidence ?? []).entries()) {
    requireNonEmptyString(evidence.message, `${path}.evidence[${index}].message`, collector);
  }
}

export function hasMatchingUnsupportedMember(
  members: readonly DotnetUnsupportedMemberDeclaration[],
  member: DotnetMemberDeclaration,
  memberKind: DotnetUnsupportedMemberDeclaration["memberKind"],
): boolean {
  return members.some((candidate) =>
    candidate.memberKind === memberKind &&
    candidate.targetId === member.targetId &&
    candidate.metadataName === member.metadataName &&
    typeof candidate.reason === "string" &&
    candidate.reason.length > 0
  );
}

export function dotnetConversionOperatorNameMatchesKind(
  targetName: DotnetConversionOperatorDeclaration["targetName"],
  conversionKind: DotnetConversionOperatorDeclaration["conversionKind"],
): boolean {
  return (targetName === "op_Implicit" && conversionKind === "implicit") ||
    (targetName === "op_Explicit" && conversionKind === "explicit");
}
