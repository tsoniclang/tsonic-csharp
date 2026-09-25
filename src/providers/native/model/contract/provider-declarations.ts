import { requireNonEmptyString, requireUnique, stringProperty, supportedPassingModes, supportedTypeParameterVariance } from "./support.js";
import type {
  ProviderExportDeclaration,
  ProviderHeritageDeclaration,
  ProviderMemberDeclaration,
  ProviderParameterDeclaration,
  ProviderSignatureDeclaration,
  ProviderTypeExpression,
  ProviderTypeParameterDeclaration,
} from "@tsonic/tsts";
import type { ContractCollector } from "./support.js";
import type { DotnetTypeRef } from "../index.js";

export function validateProviderExportDeclaration(
  declaration: ProviderExportDeclaration,
  path: string,
  collector: ContractCollector,
): void {
  validateOptionalProviderTypeExpression(declaration.type, `${path}.type`, collector);
  validateProviderTypeParameters(declaration.typeParameters ?? [], `${path}.typeParameters`, collector);
  for (const [index, heritage] of (declaration.heritage ?? []).entries()) {
    validateProviderHeritage(heritage, `${path}.heritage[${index}]`, collector);
  }
  validateProviderMemberList(
    declaration.members ?? [],
    `${path}.members`,
    collector,
    { enumMembers: declaration.kind === "enum" },
  );
  validateProviderSignatureList(declaration.signatures ?? [], `${path}.signatures`, collector, { requireReturnType: declaration.kind === "function" });
}

function validateProviderMemberList(
  members: readonly ProviderMemberDeclaration[],
  path: string,
  collector: ContractCollector,
  options: { readonly enumMembers: boolean },
): void {
  const memberIds = new Set<string>();
  const memberSurfaces = new Set<string>();
  for (const [index, member] of members.entries()) {
    const memberPath = `${path}[${index}]`;
    requireNonEmptyString(member.id, `${memberPath}.id`, collector);
    requireUnique(memberIds, member.id, `${memberPath}.id`, collector);
    requireUnique(
      memberSurfaces,
      providerMemberSurfaceKey(member),
      `${memberPath}.name`,
      collector,
    );
    if (options.enumMembers) {
      validateProviderEnumMember(member, memberPath, collector);
      continue;
    }
    validateOptionalProviderTypeExpression(member.type, `${memberPath}.type`, collector);
    validateProviderSignatureList(member.signatures ?? [], `${memberPath}.signatures`, collector, {
      requireReturnType: member.kind === "method" || member.kind === "indexer",
    });
  }
}
function validateProviderEnumMember(
  member: ProviderMemberDeclaration,
  path: string,
  collector: ContractCollector,
): void {
  if (member.static === true) {
    collector.add(`${path}.static`, "Provider enum members must use enum declaration semantics rather than static field semantics.");
  }
  if (member.readonly === true) {
    collector.add(`${path}.readonly`, "Provider enum members must use enum declaration semantics rather than readonly field semantics.");
  }
  if (member.optional === true) {
    collector.add(`${path}.optional`, "Provider enum members cannot be optional.");
  }
  if (member.type !== undefined) {
    collector.add(`${path}.type`, "Provider enum members cannot carry a field type.");
  }
  if ((member.signatures?.length ?? 0) > 0) {
    collector.add(`${path}.signatures`, "Provider enum members cannot carry signatures.");
  }
}
function providerMemberSurfaceKey(member: ProviderMemberDeclaration): string {
  switch (member.kind) {
    case "constructor":
      return "constructor";
    case "indexer":
      return "indexer";
    case "method":
    case "property":
    case "field":
      return JSON.stringify([
        member.static === true,
        providerMemberPropertySourceKey(member.name),
      ]);
  }
}

function providerMemberPropertySourceKey(
  name: ProviderMemberDeclaration["name"],
): readonly [string, string] {
  if (typeof name !== "string" && name.kind === "well-known-symbol") {
    return ["well-known-symbol", name.name];
  }
  const text = typeof name === "string"
    ? name
    : name.kind === "number-literal"
      ? String(name.value)
      : name.text;
  return ["property-key", text];
}

function validateProviderSignatureList(
  signatures: readonly ProviderSignatureDeclaration[],
  path: string,
  collector: ContractCollector,
  options: { readonly requireReturnType: boolean },
): void {
  const signatureIds = new Set<string>();
  for (const [index, signature] of signatures.entries()) {
    const signaturePath = `${path}[${index}]`;
    requireNonEmptyString(signature.id, `${signaturePath}.id`, collector);
    requireUnique(signatureIds, signature.id, `${signaturePath}.id`, collector);
    validateProviderTypeParameters(signature.typeParameters ?? [], `${signaturePath}.typeParameters`, collector);
    for (const [parameterIndex, parameter] of signature.parameters.entries()) {
      validateProviderParameter(parameter, `${signaturePath}.parameters[${parameterIndex}]`, collector, {
        index: parameterIndex,
        count: signature.parameters.length,
      });
    }
    if (signature.returnType === undefined) {
      if (options.requireReturnType) {
        collector.add(`${signaturePath}.returnType`, "Provider signatures that model callable source members must carry returnType.");
      }
    } else {
      validateProviderTypeExpression(signature.returnType, `${signaturePath}.returnType`, collector);
    }
  }
}

function validateProviderParameter(
  parameter: ProviderParameterDeclaration,
  path: string,
  collector: ContractCollector,
  options: { readonly index: number; readonly count: number },
): void {
  requireNonEmptyString(parameter.name, `${path}.name`, collector);
  validateProviderTypeExpression(parameter.type, `${path}.type`, collector);
  validateOptionalProviderTypeExpression(parameter.defaultType, `${path}.defaultType`, collector);
  if (parameter.passingMode !== undefined && !supportedPassingModes.has(parameter.passingMode)) {
    collector.add(`${path}.passingMode`, "Provider declaration parameter passingMode is not a supported provider contract value.", parameter.passingMode);
  }
  if (parameter.rest === true) {
    if (options.index !== options.count - 1) {
      collector.add(`${path}.rest`, "Provider declaration rest parameters must be the final parameter.");
    }
    if (parameter.passingMode !== undefined && parameter.passingMode !== "by-value") {
      collector.add(`${path}.passingMode`, "Provider declaration rest parameters must be passed by value.", parameter.passingMode);
    }
    if (parameter.type.kind !== "array") {
      collector.add(`${path}.type`, "Provider declaration rest parameters must carry an array source type.", parameter.type);
    }
  }
}

function validateProviderHeritage(
  heritage: ProviderHeritageDeclaration,
  path: string,
  collector: ContractCollector,
): void {
  validateProviderTypeExpression(heritage.type, `${path}.type`, collector);
}

function validateProviderTypeParameters(
  parameters: readonly ProviderTypeParameterDeclaration[],
  path: string,
  collector: ContractCollector,
): void {
  const names = new Set<string>();
  for (const [index, parameter] of parameters.entries()) {
    const parameterPath = `${path}[${index}]`;
    requireNonEmptyString(parameter.name, `${parameterPath}.name`, collector);
    requireUnique(names, parameter.name, `${parameterPath}.name`, collector);
    for (const [constraintIndex, constraint] of (parameter.constraints ?? []).entries()) {
      validateProviderTypeExpression(constraint, `${parameterPath}.constraints[${constraintIndex}]`, collector);
    }
    validateOptionalProviderTypeExpression(parameter.defaultType, `${parameterPath}.defaultType`, collector);
    if (parameter.variance !== undefined && !supportedTypeParameterVariance.has(parameter.variance)) {
      collector.add(`${parameterPath}.variance`, "Provider type parameter variance is not a supported contract value.", parameter.variance);
    }
  }
}

export function validateDotnetRawProviderRef(
  type: DotnetTypeRef,
  path: string,
  collector: ContractCollector,
): void {
  const record = type as unknown as Readonly<Record<string, unknown>>;
  if (stringProperty(record, "exportName") === undefined) {
    collector.add(`${path}.exportName`, "Raw .NET provider-ref source shapes must identify the referenced export name.", record.exportName);
  }
  if (stringProperty(record, "moduleSpecifier") === undefined) {
    collector.add(`${path}.moduleSpecifier`, "Raw .NET provider-ref source shapes must identify the referenced module specifier.", record.moduleSpecifier);
  }
}

function validateOptionalProviderTypeExpression(
  type: ProviderTypeExpression | undefined,
  path: string,
  collector: ContractCollector,
): void {
  if (type !== undefined) {
    validateProviderTypeExpression(type, path, collector);
  }
}

function validateProviderTypeExpression(
  type: ProviderTypeExpression,
  path: string,
  collector: ContractCollector,
): void {
  switch (type.kind) {
    case "provider-ref":
      requireNonEmptyString(type.moduleSpecifier, `${path}.moduleSpecifier`, collector);
      requireNonEmptyString(type.exportName, `${path}.exportName`, collector);
      for (const [index, argument] of (type.typeArguments ?? []).entries()) {
        validateProviderTypeExpression(argument, `${path}.typeArguments[${index}]`, collector);
      }
      return;
    case "source-global":
      requireNonEmptyString(type.name, `${path}.name`, collector);
      for (const [index, argument] of (type.typeArguments ?? []).entries()) {
        validateProviderTypeExpression(argument, `${path}.typeArguments[${index}]`, collector);
      }
      return;
    case "array":
      validateProviderTypeExpression(type.elementType, `${path}.elementType`, collector);
      return;
    case "tuple":
      for (const [index, element] of type.elementTypes.entries()) {
        validateProviderTypeExpression(element, `${path}.elementTypes[${index}]`, collector);
      }
      return;
    case "union":
    case "intersection":
      if (type.types.length === 0) {
        collector.add(`${path}.types`, "Provider union/intersection type expressions must contain at least one type.");
      }
      for (const [index, element] of type.types.entries()) {
        validateProviderTypeExpression(element, `${path}.types[${index}]`, collector);
      }
      return;
    case "function":
      validateProviderTypeParameters(type.typeParameters ?? [], `${path}.typeParameters`, collector);
      for (const [index, parameter] of type.parameters.entries()) {
        validateProviderParameter(parameter, `${path}.parameters[${index}]`, collector, {
          index,
          count: type.parameters.length,
        });
      }
      validateProviderTypeExpression(type.returnType, `${path}.returnType`, collector);
      return;
    case "any":
    case "unknown":
    case "void":
    case "undefined":
    case "never":
    case "boolean":
    case "string":
    case "number":
    case "bigint":
    case "object":
    case "literal":
      return;
    case "source-primitive":
    case "type-parameter":
      requireNonEmptyString(type.name, `${path}.name`, collector);
      return;
  }
}
