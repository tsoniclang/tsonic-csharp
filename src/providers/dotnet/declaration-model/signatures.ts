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
import { dotnetProviderMemberId } from "../provider-member-identity.js";

export function dotnetSignatureToProviderSignature(
  signature: DotnetSignatureDeclaration,
  memberTargetName?: string,
  signatureId: string = signature.id,
  options: {
    readonly sourceParameterOffset?: number;
    readonly parentTypeParameterNames?: readonly string[];
  } = {},
): ProviderSignatureDeclaration | undefined {
  const sourceParameters = signature.parameters.slice(options.sourceParameterOffset ?? 0);
  const parameters = sourceParameters.map((parameter, index) =>
    dotnetParameterToProviderParameter(parameter, `${signatureId}.parameters[${index}]`));
  const returnType = signature.returnType === undefined
    ? undefined
    : tryDotnetTypeRefToProviderType(signature.returnType, `${signatureId}.returnType`);
  if (parameters.some((parameter) => parameter === undefined) || (signature.returnType !== undefined && returnType === undefined)) {
    return undefined;
  }
  return normalizeProviderSignatureTypeParameterScope({
    id: signatureId,
    ...(signature.targetName !== undefined || memberTargetName !== undefined ? { name: signature.targetName ?? memberTargetName } : {}),
    parameters: parameters as ProviderParameterDeclaration[],
    ...(returnType !== undefined ? { returnType } : {}),
    ...(signature.typeParameters !== undefined
      ? {
        typeParameters: signature.typeParameters.map((parameter, index) =>
          dotnetTypeParameterToProviderTypeParameter(parameter, `${signatureId}.typeParameters[${index}]`)),
      }
      : {}),
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
      const shapeKey = dotnetProviderSignatureSelectionKey(signature, memberTargetName, options);
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

export function dotnetProviderSignatureSelectionKey(
  signature: DotnetSignatureDeclaration,
  memberTargetName?: string,
  options: {
    readonly sourceParameterOffset?: number;
    readonly parentTypeParameterNames?: readonly string[];
  } = {},
): string | undefined {
  const providerSignature = dotnetSignatureToProviderSignature(signature, memberTargetName, signature.id, options);
  return providerSignature === undefined ? undefined : providerSignatureSelectionKey(providerSignature);
}

export function mergeProviderSignatures(signatures: readonly ProviderSignatureDeclaration[]): readonly ProviderSignatureDeclaration[] {
  const bySelectionIdentity = new Map<string, ProviderSignatureDeclaration[]>();
  for (const signature of signatures) {
    const group = bySelectionIdentity.get(signature.id) ?? [];
    group.push(signature);
    bySelectionIdentity.set(signature.id, group);
  }
  const mergedSelectionIdentities = [...bySelectionIdentity.values()].flatMap((group) => {
    if (group.length === 1) {
      return group;
    }
    const merged = mergeProviderSourceSelectionSignatures(group);
    return merged === undefined ? group : [merged];
  });
  const byShape = new Map<string, ProviderSignatureDeclaration>();
  for (const signature of mergedSelectionIdentities) {
    byShape.set(providerSignatureShapeKey(signature), signature);
  }
  return sortProviderSignaturesBySourceSpecificity([...byShape.values()]);
}

function mergeProviderSourceSelectionSignatures(
  signatures: readonly ProviderSignatureDeclaration[],
): ProviderSignatureDeclaration | undefined {
  const first = signatures[0];
  if (first === undefined) {
    return undefined;
  }
  const selectionKey = providerSignatureSelectionKey(first);
  if (signatures.some((signature) =>
    signature.id !== first.id ||
    signature.name !== first.name ||
    providerSignatureSelectionKey(signature) !== selectionKey ||
    !providerSignatureStructureMatches(first, signature)
  )) {
    return undefined;
  }
  return {
    ...first,
    parameters: first.parameters.map((parameter, index) => ({
      ...parameter,
      type: mergeProviderSourceSelectionTypes(signatures.map((signature) => signature.parameters[index]!.type)),
      ...(parameter.defaultType === undefined
        ? {}
        : { defaultType: mergeProviderSourceSelectionTypes(signatures.map((signature) => signature.parameters[index]!.defaultType!)) }),
    })),
    ...(first.returnType === undefined
      ? {}
      : { returnType: mergeProviderSourceSelectionTypes(signatures.map((signature) => signature.returnType!)) }),
    ...(first.typeParameters === undefined
      ? {}
      : {
          typeParameters: first.typeParameters.map((parameter, index) => ({
            ...parameter,
            ...(parameter.constraints === undefined
              ? {}
              : {
                  constraints: parameter.constraints.map((_, constraintIndex) =>
                    mergeProviderSourceSelectionTypes(signatures.map((signature) => signature.typeParameters![index]!.constraints![constraintIndex]!))),
                }),
            ...(parameter.defaultType === undefined
              ? {}
              : { defaultType: mergeProviderSourceSelectionTypes(signatures.map((signature) => signature.typeParameters![index]!.defaultType!)) }),
          })),
        }),
  };
}

function providerSignatureStructureMatches(
  left: ProviderSignatureDeclaration,
  right: ProviderSignatureDeclaration,
): boolean {
  if (
    left.parameters.length !== right.parameters.length ||
    (left.typeParameters?.length ?? 0) !== (right.typeParameters?.length ?? 0) ||
    (left.returnType === undefined) !== (right.returnType === undefined)
  ) {
    return false;
  }
  for (const [index, parameter] of left.parameters.entries()) {
    const candidate = right.parameters[index]!;
    if (
      parameter.passingMode !== candidate.passingMode ||
      parameter.optional !== candidate.optional ||
      parameter.rest !== candidate.rest ||
      (parameter.defaultType === undefined) !== (candidate.defaultType === undefined)
    ) {
      return false;
    }
  }
  for (const [index, parameter] of (left.typeParameters ?? []).entries()) {
    const candidate = right.typeParameters![index]!;
    if (
      parameter.name !== candidate.name ||
      parameter.variance !== candidate.variance ||
      (parameter.constraints?.length ?? 0) !== (candidate.constraints?.length ?? 0) ||
      (parameter.defaultType === undefined) !== (candidate.defaultType === undefined)
    ) {
      return false;
    }
  }
  return true;
}

function mergeProviderSourceSelectionTypes(
  types: readonly import("@tsonic/tsts").ProviderTypeExpression[],
): import("@tsonic/tsts").ProviderTypeExpression {
  const exactTypes = new Map<string, import("@tsonic/tsts").ProviderTypeExpression>();
  for (const type of types) {
    for (const sourceType of providerTypeExpressionSourceProjection(type)) {
      exactTypes.set(JSON.stringify(providerTypeExpressionSourceShapeKey(sourceType)), sourceType);
    }
  }
  const merged = [...exactTypes.values()];
  return merged.length === 1 ? merged[0]! : { kind: "union", types: merged };
}

function providerTypeExpressionSourceProjection(
  type: import("@tsonic/tsts").ProviderTypeExpression,
): readonly import("@tsonic/tsts").ProviderTypeExpression[] {
  switch (type.kind) {
    case "source-primitive":
      return [{ kind: sourcePrimitiveSourceRuntimeKind(type.name) }];
    case "source-global":
      return [{
        ...type,
        ...(type.typeArguments === undefined
          ? {}
          : { typeArguments: type.typeArguments.map((argument) => mergeProviderSourceSelectionTypes([argument])) }),
      }];
    case "union":
      return type.types.flatMap(providerTypeExpressionSourceProjection);
    case "array":
      return [{
        kind: "array",
        elementType: mergeProviderSourceSelectionTypes([type.elementType]),
      }];
    case "tuple":
      return [{
        kind: "tuple",
        elementTypes: type.elementTypes.map((elementType) => mergeProviderSourceSelectionTypes([elementType])),
      }];
    case "intersection":
      return [{
        kind: "intersection",
        types: type.types.map((nestedType) => mergeProviderSourceSelectionTypes([nestedType])),
      }];
    case "function":
      return [{
        ...type,
        parameters: type.parameters.map((parameter) => ({
          ...parameter,
          type: mergeProviderSourceSelectionTypes([parameter.type]),
          ...(parameter.defaultType === undefined
            ? {}
            : { defaultType: mergeProviderSourceSelectionTypes([parameter.defaultType]) }),
        })),
        returnType: mergeProviderSourceSelectionTypes([type.returnType]),
      }];
    case "provider-ref":
      return [{
        ...type,
        ...(type.typeArguments === undefined
          ? {}
          : { typeArguments: type.typeArguments.map((argument) => mergeProviderSourceSelectionTypes([argument])) }),
      }];
    case "any":
    case "unknown":
    case "void":
    case "never":
    case "undefined":
    case "boolean":
    case "string":
    case "number":
    case "bigint":
    case "object":
    case "literal":
    case "type-parameter":
      return [type];
  }
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

export function renameProviderTypeParameter(
  parameter: NonNullable<ProviderSignatureDeclaration["typeParameters"]>[number],
  renames: ReadonlyMap<string, string>,
): NonNullable<ProviderSignatureDeclaration["typeParameters"]>[number] {
  return {
    ...parameter,
    ...(parameter.constraints === undefined ? {} : { constraints: parameter.constraints.map((constraint) => renameProviderTypeExpressionTypeParameters(constraint, renames)) }),
    ...(parameter.defaultType === undefined ? {} : { defaultType: renameProviderTypeExpressionTypeParameters(parameter.defaultType, renames) }),
  };
}

export function renameProviderParameterTypeParameters(
  parameter: ProviderParameterDeclaration,
  renames: ReadonlyMap<string, string>,
): ProviderParameterDeclaration {
  return {
    ...parameter,
    type: renameProviderTypeExpressionTypeParameters(parameter.type, renames),
    ...(parameter.defaultType === undefined ? {} : { defaultType: renameProviderTypeExpressionTypeParameters(parameter.defaultType, renames) }),
  };
}

export function renameProviderTypeExpressionTypeParameters(
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
    case "source-global":
      return type.typeArguments === undefined
        ? type
        : { ...type, typeArguments: type.typeArguments.map((argument) => renameProviderTypeExpressionTypeParameters(argument, renames)) };
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
        ...(type.typeParameters === undefined
          ? {}
          : { typeParameters: type.typeParameters.map((parameter) => renameProviderTypeParameter(parameter, nestedRenames)) }),
        parameters: type.parameters.map((parameter) => renameProviderParameterTypeParameters(parameter, nestedRenames)),
        returnType: renameProviderTypeExpressionTypeParameters(type.returnType, nestedRenames),
      };
    }
    case "any":
    case "unknown":
    case "void":
    case "never":
    case "undefined":
    case "boolean":
    case "string":
    case "number":
    case "bigint":
    case "object":
    case "literal":
    case "source-primitive":
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
  return providerSignatureKey(signature, "exact");
}

function providerSignatureSelectionKey(signature: ProviderSignatureDeclaration): string {
  return providerSignatureKey(signature, "selection");
}

function providerSignatureKey(
  signature: ProviderSignatureDeclaration,
  mode: "exact" | "selection",
): string {
  return JSON.stringify({
    typeParameters: signature.typeParameters?.map((parameter) => ({
      variance: parameter.variance,
      constraints: parameter.constraints?.map((constraint) => providerTypeExpressionSourceShapeKey(constraint, mode)),
      defaultType: parameter.defaultType === undefined ? undefined : providerTypeExpressionSourceShapeKey(parameter.defaultType, mode),
    })),
    parameters: signature.parameters.map((parameter) => ({
      passingMode: parameter.passingMode,
      optional: parameter.optional,
      rest: parameter.rest,
      type: providerTypeExpressionSourceShapeKey(parameter.type, mode),
    })),
    returnType: signature.returnType === undefined ? undefined : providerTypeExpressionSourceShapeKey(signature.returnType),
  });
}

function providerTypeExpressionSourceShapeKey(
  type: import("@tsonic/tsts").ProviderTypeExpression,
  mode: "exact" | "selection" = "exact",
): unknown {
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
    case "source-global":
      return {
        kind: "source-global",
        name: type.name,
        typeArguments: type.typeArguments?.map((argument) => providerTypeExpressionSourceShapeKey(argument, mode)),
      };
    case "type-parameter":
      return { kind: "type-parameter", name: type.name };
    case "array":
      return { kind: "array", elementType: providerTypeExpressionSourceShapeKey(type.elementType, mode) };
    case "tuple":
      return { kind: "tuple", elementTypes: type.elementTypes.map((elementType) => providerTypeExpressionSourceShapeKey(elementType, mode)) };
    case "union": {
      const types = mode === "selection"
        ? type.types.filter((member) => member.kind !== "undefined")
        : type.types;
      if (mode === "selection" && types.length === 1) {
        return providerTypeExpressionSourceShapeKey(types[0]!, mode);
      }
      return { kind: "union", types: types.map((member) => providerTypeExpressionSourceShapeKey(member, mode)) };
    }
    case "intersection":
      return { kind: "intersection", types: type.types.map((member) => providerTypeExpressionSourceShapeKey(member, mode)) };
    case "function":
      return {
        kind: "function",
        typeParameters: type.typeParameters?.map((parameter) => ({
          variance: parameter.variance,
          constraints: parameter.constraints?.map((constraint) => providerTypeExpressionSourceShapeKey(constraint, mode)),
          defaultType: parameter.defaultType === undefined ? undefined : providerTypeExpressionSourceShapeKey(parameter.defaultType, mode),
        })),
        parameters: type.parameters.map((parameter) => ({
          passingMode: parameter.passingMode,
          optional: parameter.optional,
          rest: parameter.rest,
          type: providerTypeExpressionSourceShapeKey(parameter.type, mode),
        })),
        returnType: providerTypeExpressionSourceShapeKey(type.returnType, mode),
      };
    case "provider-ref":
      return {
        kind: "provider-ref",
        moduleSpecifier: type.moduleSpecifier,
        exportName: type.exportName,
        typeArguments: type.typeArguments?.map((argument) => providerTypeExpressionSourceShapeKey(argument, mode)),
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
    case "source-global": {
      const typeArguments = type.typeArguments ?? [];
      return 8 +
        sumProviderTypeExpressionScores(typeArguments) -
        (typeArguments.length * 4);
    }
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
