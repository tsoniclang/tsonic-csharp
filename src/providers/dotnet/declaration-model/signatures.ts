import type {
  ProviderParameterDeclaration,
  ProviderSignatureDeclaration,
} from "@tsonic/tsts";
import type { DotnetMemberDeclaration, DotnetSignatureDeclaration } from "../model.js";
import {
  dotnetTypeParameterToProviderTypeParameter,
  tryDotnetTypeRefToProviderType,
} from "../model.js";
import { dotnetParameterToProviderParameter } from "./parameters.js";

export function dotnetSignatureToProviderSignature(
  signature: DotnetSignatureDeclaration,
  memberTargetName?: string,
  signatureId: string = signature.id,
  options: {
    readonly sourceParameterOffset?: number;
    readonly parentTypeParameterNames?: readonly string[];
  } = {},
): ProviderSignatureDeclaration | undefined {
  const parameters = signature.parameters.slice(options.sourceParameterOffset ?? 0).map(dotnetParameterToProviderParameter);
  const returnType = signature.returnType === undefined ? undefined : tryDotnetTypeRefToProviderType(signature.returnType);
  if (parameters.some((parameter) => parameter === undefined) || (signature.returnType !== undefined && returnType === undefined)) {
    return undefined;
  }
  return normalizeProviderSignatureTypeParameterScope({
    id: signatureId,
    ...(signature.targetName !== undefined || memberTargetName !== undefined ? { name: signature.targetName ?? memberTargetName } : {}),
    parameters: parameters as ProviderParameterDeclaration[],
    ...(returnType !== undefined ? { returnType } : {}),
    ...(signature.typeParameters !== undefined ? { typeParameters: signature.typeParameters.map(dotnetTypeParameterToProviderTypeParameter) } : {}),
  }, options.parentTypeParameterNames ?? []);
}

export function dotnetProviderSignatureIdsForMember(
  member: DotnetMemberDeclaration,
  memberTargetName?: string,
  options: {
    readonly sourceParameterOffset?: number;
    readonly parentTypeParameterNames?: readonly string[];
  } = {},
): ReadonlyMap<string, string> {
  const shapeEntries = (member.signatures ?? [])
    .map((signature) => {
      const shapeKey = dotnetProviderSignatureShapeKey(signature, memberTargetName, options);
      return shapeKey === undefined ? undefined : { signature, shapeKey };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== undefined);
  const shapeCounts = new Map<string, number>();
  for (const { shapeKey } of shapeEntries) {
    shapeCounts.set(shapeKey, (shapeCounts.get(shapeKey) ?? 0) + 1);
  }
  return new Map(shapeEntries.map(({ signature, shapeKey }) => [
    signature.id,
    (shapeCounts.get(shapeKey) ?? 0) > 1
      ? dotnetSourceProjectionSignatureId(member, shapeKey)
      : signature.id,
  ]));
}

export function dotnetProviderSignatureShapeKey(
  signature: DotnetSignatureDeclaration,
  memberTargetName?: string,
  options: {
    readonly sourceParameterOffset?: number;
    readonly parentTypeParameterNames?: readonly string[];
  } = {},
): string | undefined {
  const providerSignature = dotnetSignatureToProviderSignature(signature, memberTargetName, signature.id, options);
  return providerSignature === undefined ? undefined : providerSignatureShapeKey(providerSignature);
}

export function mergeProviderSignatures(signatures: readonly ProviderSignatureDeclaration[]): readonly ProviderSignatureDeclaration[] {
  const byId = new Map<string, ProviderSignatureDeclaration>();
  for (const signature of signatures) {
    byId.set(providerSignatureShapeKey(signature), signature);
  }
  return sortProviderSignaturesBySourceSpecificity([...byId.values()]);
}

export function normalizeProviderSignatureTypeParameterScope(
  signature: ProviderSignatureDeclaration,
  parentTypeParameterNames: readonly string[],
): ProviderSignatureDeclaration {
  if (parentTypeParameterNames.length === 0 || signature.typeParameters === undefined || signature.typeParameters.length === 0) {
    return signature;
  }
  const usedNames = new Set(parentTypeParameterNames);
  const renames = new Map<string, string>();
  const typeParameters = signature.typeParameters.map((parameter) => {
    const scopedName = usedNames.has(parameter.name)
      ? uniqueProviderTypeParameterName(parameter.name, usedNames)
      : parameter.name;
    usedNames.add(scopedName);
    if (scopedName !== parameter.name) {
      renames.set(parameter.name, scopedName);
    }
    return scopedName === parameter.name
      ? parameter
      : {
          ...parameter,
          name: scopedName,
        };
  });
  if (renames.size === 0) {
    return signature;
  }
  return {
    ...signature,
    typeParameters: typeParameters.map((parameter) => renameProviderTypeParameter(parameter, renames)),
    parameters: signature.parameters.map((parameter) => renameProviderParameterTypeParameters(parameter, renames)),
    ...(signature.returnType === undefined ? {} : { returnType: renameProviderTypeExpressionTypeParameters(signature.returnType, renames) }),
  };
}

function uniqueProviderTypeParameterName(baseName: string, usedNames: Set<string>): string {
  let candidate = `${baseName}Method`;
  if (!usedNames.has(candidate)) {
    return candidate;
  }
  for (let index = 2; ; index++) {
    candidate = `${baseName}Method${index}`;
    if (!usedNames.has(candidate)) {
      return candidate;
    }
  }
}

function renameProviderTypeParameter(
  parameter: NonNullable<ProviderSignatureDeclaration["typeParameters"]>[number],
  renames: ReadonlyMap<string, string>,
): NonNullable<ProviderSignatureDeclaration["typeParameters"]>[number] {
  return {
    ...parameter,
    ...(parameter.constraints === undefined ? {} : { constraints: parameter.constraints.map((constraint) => renameProviderTypeExpressionTypeParameters(constraint, renames)) }),
    ...(parameter.defaultType === undefined ? {} : { defaultType: renameProviderTypeExpressionTypeParameters(parameter.defaultType, renames) }),
  };
}

function renameProviderParameterTypeParameters(
  parameter: ProviderParameterDeclaration,
  renames: ReadonlyMap<string, string>,
): ProviderParameterDeclaration {
  return {
    ...parameter,
    type: renameProviderTypeExpressionTypeParameters(parameter.type, renames),
  };
}

function renameProviderTypeExpressionTypeParameters(
  type: import("@tsonic/tsts").ProviderTypeExpression,
  renames: ReadonlyMap<string, string>,
): import("@tsonic/tsts").ProviderTypeExpression {
  switch (type.kind) {
    case "type-parameter":
      return renames.has(type.name) ? { ...type, name: renames.get(type.name)! } : type;
    case "provider-ref":
      return type.typeArguments === undefined
        ? type
        : { ...type, typeArguments: type.typeArguments.map((argument) => renameProviderTypeExpressionTypeParameters(argument, renames)) };
    case "target-named":
      return {
        ...type,
        ...(type.typeArguments === undefined ? {} : { typeArguments: type.typeArguments.map((argument) => renameProviderTypeExpressionTypeParameters(argument, renames)) }),
        ...(type.sourceShape === undefined ? {} : { sourceShape: renameProviderTypeExpressionTypeParameters(type.sourceShape, renames) }),
      };
    case "array":
      return { ...type, elementType: renameProviderTypeExpressionTypeParameters(type.elementType, renames) };
    case "tuple":
      return { ...type, elementTypes: type.elementTypes.map((elementType) => renameProviderTypeExpressionTypeParameters(elementType, renames)) };
    case "union":
    case "intersection":
      return { ...type, types: type.types.map((nestedType) => renameProviderTypeExpressionTypeParameters(nestedType, renames)) };
    case "function": {
      const nestedRenames = new Map(renames);
      for (const parameter of type.typeParameters ?? []) {
        nestedRenames.delete(parameter.name);
      }
      return {
        ...type,
        parameters: type.parameters.map((parameter) => renameProviderParameterTypeParameters(parameter, nestedRenames)),
        returnType: renameProviderTypeExpressionTypeParameters(type.returnType, nestedRenames),
      };
    }
    case "opaque":
      return type.sourceShape === undefined
        ? type
        : { ...type, sourceShape: renameProviderTypeExpressionTypeParameters(type.sourceShape, renames) };
    case "undefined":
    default:
      return type;
  }
}

function sortProviderSignaturesBySourceSpecificity(
  signatures: readonly ProviderSignatureDeclaration[],
): readonly ProviderSignatureDeclaration[] {
  return signatures
    .map((signature, index) => ({ signature, index, score: providerSignatureSourceSpecificityScore(signature) }))
    .sort((left, right) => left.score - right.score || left.index - right.index)
    .map((entry) => entry.signature);
}

function providerSignatureSourceSpecificityScore(signature: ProviderSignatureDeclaration): number {
  return signature.parameters.reduce((score, parameter) =>
    score + providerTypeExpressionSourceSpecificityScore(parameter.type), 0);
}

export function providerSignatureShapeKey(signature: ProviderSignatureDeclaration): string {
  return JSON.stringify({
    typeParameters: signature.typeParameters?.map((parameter) => ({
      variance: parameter.variance,
      constraints: parameter.constraints?.map(providerTypeExpressionSourceShapeKey),
      defaultType: parameter.defaultType === undefined ? undefined : providerTypeExpressionSourceShapeKey(parameter.defaultType),
    })),
    parameters: signature.parameters.map((parameter) => ({
      passingMode: parameter.passingMode,
      optional: parameter.optional,
      rest: parameter.rest,
      type: providerTypeExpressionSourceShapeKey(parameter.type),
    })),
    returnType: signature.returnType === undefined ? undefined : providerTypeExpressionSourceShapeKey(signature.returnType),
  });
}

function providerTypeExpressionSourceShapeKey(type: import("@tsonic/tsts").ProviderTypeExpression): unknown {
  switch (type.kind) {
    case "any":
    case "unknown":
    case "void":
    case "never":
    case "boolean":
    case "string":
    case "number":
    case "bigint":
    case "object":
    case "undefined":
      return { kind: type.kind };
    case "literal":
      return { kind: "literal", value: type.value };
    case "source-primitive":
      return { kind: sourcePrimitiveSourceRuntimeKind(type.name) };
    case "type-parameter":
      return { kind: "type-parameter", name: type.name };
    case "target-named":
    case "opaque":
      return type.sourceShape === undefined
        ? { kind: type.kind, id: type.id }
        : providerTypeExpressionSourceShapeKey(type.sourceShape);
    case "array":
      return { kind: "array", elementType: providerTypeExpressionSourceShapeKey(type.elementType) };
    case "tuple":
      return { kind: "tuple", elementTypes: type.elementTypes.map(providerTypeExpressionSourceShapeKey) };
    case "union":
      return { kind: "union", types: type.types.map(providerTypeExpressionSourceShapeKey) };
    case "intersection":
      return { kind: "intersection", types: type.types.map(providerTypeExpressionSourceShapeKey) };
    case "function":
      return {
        kind: "function",
        typeParameters: type.typeParameters?.map((parameter) => ({
          variance: parameter.variance,
          constraints: parameter.constraints?.map(providerTypeExpressionSourceShapeKey),
          defaultType: parameter.defaultType === undefined ? undefined : providerTypeExpressionSourceShapeKey(parameter.defaultType),
        })),
        parameters: type.parameters.map((parameter) => ({
          passingMode: parameter.passingMode,
          optional: parameter.optional,
          rest: parameter.rest,
          type: providerTypeExpressionSourceShapeKey(parameter.type),
        })),
        returnType: providerTypeExpressionSourceShapeKey(type.returnType),
      };
    case "provider-ref":
      return {
        kind: "provider-ref",
        moduleSpecifier: type.moduleSpecifier,
        exportName: type.exportName,
        typeArguments: type.typeArguments?.map(providerTypeExpressionSourceShapeKey),
      };
  }
}

function providerTypeExpressionSourceSpecificityScore(type: import("@tsonic/tsts").ProviderTypeExpression): number {
  switch (type.kind) {
    case "literal":
    case "source-primitive":
    case "string":
    case "boolean":
    case "number":
    case "bigint":
    case "object":
    case "void":
    case "never":
    case "undefined":
      return 0;
    case "any":
    case "unknown":
      return 1;
    case "type-parameter":
      return 2;
    case "array":
      return 1 + providerTypeExpressionSourceSpecificityScore(type.elementType);
    case "tuple":
      return 1 + sumProviderTypeExpressionScores(type.elementTypes);
    case "function":
      return 1 +
        sumProviderTypeExpressionScores(type.parameters.map((parameter) => parameter.type)) +
        providerFunctionReturnSourceSpecificityScore(type.returnType);
    case "union":
    case "intersection":
      return 2 + sumProviderTypeExpressionScores(type.types);
    case "target-named":
    case "opaque":
      return 4 + (type.sourceShape === undefined ? 12 : providerTypeExpressionSourceSpecificityScore(type.sourceShape));
    case "provider-ref":
      return providerRefSourceSpecificityScore(type);
  }
}

function providerFunctionReturnSourceSpecificityScore(type: import("@tsonic/tsts").ProviderTypeExpression): number {
  return type.kind === "void"
    ? 16
    : providerTypeExpressionSourceSpecificityScore(type);
}

function sumProviderTypeExpressionScores(types: readonly import("@tsonic/tsts").ProviderTypeExpression[]): number {
  return types.reduce((score, type) => score + providerTypeExpressionSourceSpecificityScore(type), 0);
}

function providerRefSourceSpecificityScore(type: Extract<import("@tsonic/tsts").ProviderTypeExpression, { readonly kind: "provider-ref" }>): number {
  const typeArguments = type.typeArguments ?? [];
  return 8 +
    sumProviderTypeExpressionScores(typeArguments) -
    (typeArguments.length * 4);
}

function sourcePrimitiveSourceRuntimeKind(name: string): "boolean" | "string" | "number" {
  if (name === "bool") {
    return "boolean";
  }
  if (name === "char") {
    return "string";
  }
  return "number";
}

function dotnetSourceProjectionSignatureId(member: DotnetMemberDeclaration, shapeKey: string): string {
  return `${dotnetProviderMemberId(member)}#source-signature:${encodeURIComponent(shapeKey)}`;
}

function dotnetProviderMemberId(member: DotnetMemberDeclaration): string {
  return member.kind === "constructor"
    ? dotnetMetadataNameWithoutSignature(member.targetId)
    : member.targetId;
}

function dotnetMetadataNameWithoutSignature(metadataName: string): string {
  const signatureStart = metadataName.indexOf("(");
  return signatureStart === -1 ? metadataName : metadataName.slice(0, signatureStart);
}
