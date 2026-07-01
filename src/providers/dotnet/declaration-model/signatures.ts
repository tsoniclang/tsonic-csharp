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
): ProviderSignatureDeclaration | undefined {
  const parameters = signature.parameters.map(dotnetParameterToProviderParameter);
  const returnType = signature.returnType === undefined ? undefined : tryDotnetTypeRefToProviderType(signature.returnType);
  if (parameters.some((parameter) => parameter === undefined) || (signature.returnType !== undefined && returnType === undefined)) {
    return undefined;
  }
  return {
    id: signatureId,
    ...(signature.targetName !== undefined || memberTargetName !== undefined ? { name: signature.targetName ?? memberTargetName } : {}),
    parameters: parameters as ProviderParameterDeclaration[],
    ...(returnType !== undefined ? { returnType } : {}),
    ...(signature.typeParameters !== undefined ? { typeParameters: signature.typeParameters.map(dotnetTypeParameterToProviderTypeParameter) } : {}),
  };
}

export function dotnetProviderSignatureIdsForMember(
  member: DotnetMemberDeclaration,
  memberTargetName?: string,
): ReadonlyMap<string, string> {
  const shapeEntries = (member.signatures ?? [])
    .map((signature) => {
      const shapeKey = dotnetProviderSignatureShapeKey(signature, memberTargetName);
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
): string | undefined {
  const providerSignature = dotnetSignatureToProviderSignature(signature, memberTargetName);
  return providerSignature === undefined ? undefined : providerSignatureShapeKey(providerSignature);
}

export function mergeProviderSignatures(signatures: readonly ProviderSignatureDeclaration[]): readonly ProviderSignatureDeclaration[] {
  const byId = new Map<string, ProviderSignatureDeclaration>();
  for (const signature of signatures) {
    byId.set(providerSignatureShapeKey(signature), signature);
  }
  return sortProviderSignaturesBySourceSpecificity([...byId.values()]);
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

function providerSignatureShapeKey(signature: ProviderSignatureDeclaration): string {
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
        providerTypeExpressionSourceSpecificityScore(type.returnType);
    case "union":
    case "intersection":
      return 2 + sumProviderTypeExpressionScores(type.types);
    case "target-named":
    case "opaque":
      return 4 + (type.sourceShape === undefined ? 12 : providerTypeExpressionSourceSpecificityScore(type.sourceShape));
    case "provider-ref":
      return 8 + sumProviderTypeExpressionScores(type.typeArguments ?? []);
  }
}

function sumProviderTypeExpressionScores(types: readonly import("@tsonic/tsts").ProviderTypeExpression[]): number {
  return types.reduce((score, type) => score + providerTypeExpressionSourceSpecificityScore(type), 0);
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
