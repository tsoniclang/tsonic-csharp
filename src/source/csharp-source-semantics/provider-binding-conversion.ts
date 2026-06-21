import type {
  ProviderDeclarationKind,
  ProviderExportDeclaration,
  ProviderMemberDeclaration,
  ProviderParameterDeclaration,
  ProviderSignatureDeclaration,
  ProviderTypeExpression,
  ProviderTypeParameterDeclaration,
  TargetBindingFact,
  TargetConstraint,
  TargetMember,
  TargetParameter,
  TargetTypeParameter,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  csharpTargetId,
} from "./identity.js";
import {
  type CsharpTargetBindingFact,
  csharpSourcePrimitiveTargetType,
  csharpTargetNamedType,
  csharpTargetTypeFromBinding,
} from "./target-types.js";

export function providerDeclarationToTargetBinding(declaration: ProviderExportDeclaration): TargetBindingFact | undefined {
  if (declaration.targetIdentity?.target !== csharpTargetId) {
    return undefined;
  }
  const kind = providerDeclarationKindToTargetBindingKind(declaration.kind);
  if (kind === undefined) {
    return undefined;
  }
  const typeParameters = declaration.typeParameters?.map(providerTypeParameterToTargetTypeParameter) ?? [];
  const targetName = declaration.targetIdentity.displayName ?? declaration.targetIdentity.id;
  const binding = {
    id: declaration.targetIdentity.id,
    sourceName: declaration.name,
    targetName,
    target: csharpTargetId,
    kind,
    csharpType: csharpTargetTypeFromBinding({
      id: declaration.targetIdentity.id,
      sourceName: declaration.name,
      targetName,
      target: csharpTargetId,
      kind,
    }, typeParameters.map((parameter) => ({ kind: "type-parameter", name: parameter.name }) satisfies TargetTypeRef)),
    ...(typeParameters.length > 0
      ? { typeParameters }
      : {}),
    ...(declaration.members !== undefined
      ? { members: declaration.members.flatMap((member) => providerMemberToTargetMembers(member, declaration.targetIdentity!.id, targetName, typeParameters)) }
      : {}),
  } satisfies CsharpTargetBindingFact;
  return binding;
}

function providerDeclarationKindToTargetBindingKind(kind: ProviderDeclarationKind): TargetBindingFact["kind"] | undefined {
  switch (kind) {
    case "class":
      return "class";
    case "interface":
      return "interface";
    case "enum":
      return "enum";
    case "function":
      return "function";
    case "opaque":
      return "opaque";
    case "type":
    case "value":
    case "namespace":
      return undefined;
  }
}

function providerTypeParameterToTargetTypeParameter(parameter: ProviderTypeParameterDeclaration): TargetTypeParameter {
  return {
    name: parameter.name,
    ...(parameter.constraints !== undefined && parameter.constraints.length > 0
      ? { constraints: parameter.constraints.flatMap(providerTypeExpressionToTargetConstraints) }
      : {}),
    ...(parameter.variance !== undefined ? { variance: parameter.variance } : {}),
  };
}

function providerTypeExpressionToTargetConstraints(type: ProviderTypeExpression): readonly TargetConstraint[] {
  if (type.kind !== "target-named") {
    return [];
  }
  return [{
    kind: "implements",
    contract: type.id,
    ...(type.typeArguments !== undefined ? { typeArguments: type.typeArguments.map(providerTypeExpressionToTargetTypeRef) } : {}),
  }];
}

function providerMemberToTargetMembers(
  member: ProviderMemberDeclaration,
  declaringTypeId: string,
  declaringTargetName: string,
  declaringTypeParameters: readonly TargetTypeParameter[],
): readonly TargetMember[] {
  switch (member.kind) {
    case "property":
    case "field":
      return member.type === undefined
        ? []
        : [{
            id: member.id,
            sourceName: member.name,
            targetName: member.name,
            kind: member.kind,
            parameters: [],
            returnType: providerTypeExpressionToTargetTypeRef(member.type),
            declaringType: declaringTargetTypeRef(declaringTypeId, declaringTargetName, declaringTypeParameters),
            ...(declaringTypeParameters.length > 0 ? { typeParameters: declaringTypeParameters } : {}),
            ...(member.static === true ? { static: true } : {}),
          }];
    case "method":
    case "constructor":
    case "indexer":
      return (member.signatures ?? []).flatMap((signature) => {
        const targetMember = providerSignatureToTargetMember(member, signature, declaringTypeId, declaringTargetName, declaringTypeParameters);
        return targetMember === undefined ? [] : [targetMember];
      });
  }
}

function providerSignatureToTargetMember(
  member: ProviderMemberDeclaration,
  signature: ProviderSignatureDeclaration,
  declaringTypeId: string,
  declaringTargetName: string,
  declaringTypeParameters: readonly TargetTypeParameter[],
): TargetMember | undefined {
  const kind = member.kind;
  const targetName = targetMemberNameFromProviderSignature(member, signature);
  if (targetName === undefined) {
    return undefined;
  }
  const signatureTypeParameters = signature.typeParameters?.map(providerTypeParameterToTargetTypeParameter) ?? [];
  const typeParameters = [...declaringTypeParameters, ...signatureTypeParameters];
  return {
    id: signature.id,
    sourceName: member.name,
    targetName,
    kind,
    declaringType: declaringTargetTypeRef(declaringTypeId, declaringTargetName, declaringTypeParameters),
    ...(member.static === true ? { static: true } : {}),
    parameters: signature.parameters.map(providerParameterToTargetParameter),
    ...(signature.returnType !== undefined ? { returnType: providerTypeExpressionToTargetTypeRef(signature.returnType) } : {}),
    ...(typeParameters.length > 0
      ? { typeParameters }
      : {}),
  };
}

function declaringTargetTypeRef(
  declaringTypeId: string,
  declaringTargetName: string,
  declaringTypeParameters: readonly TargetTypeParameter[],
): TargetTypeRef {
  return csharpTargetTypeFromBinding({
    id: declaringTypeId,
    sourceName: declaringTargetName,
    targetName: declaringTargetName,
    target: csharpTargetId,
    kind: "class",
  }, declaringTypeParameters.map((parameter) => ({ kind: "type-parameter", name: parameter.name }) satisfies TargetTypeRef)) ??
    csharpTargetNamedType(
      declaringTypeId,
      declaringTypeParameters.map((parameter) => ({ kind: "type-parameter", name: parameter.name }) satisfies TargetTypeRef),
    );
}

function providerParameterToTargetParameter(parameter: ProviderParameterDeclaration): TargetParameter {
  return {
    name: parameter.name,
    type: providerTypeExpressionToTargetTypeRef(parameter.type),
    passingMode: parameter.passingMode ?? "by-value",
    ...(parameter.optional === true ? { optional: true } : {}),
    ...(parameter.rest === true ? { paramsArray: true } : {}),
  };
}

function providerTypeExpressionToTargetTypeRef(type: ProviderTypeExpression): TargetTypeRef {
  switch (type.kind) {
    case "boolean":
      return csharpSourcePrimitiveTargetType("bool");
    case "bigint":
      return csharpSourcePrimitiveTargetType("int64");
    case "source-primitive":
      return csharpSourcePrimitiveTargetType(type.name);
    case "type-parameter":
      return { kind: "type-parameter", name: type.name };
    case "target-named":
      return csharpTargetNamedType(
        type.id,
        type.typeArguments?.map(providerTypeExpressionToTargetTypeRef),
      );
    case "array":
      return { kind: "array", element: providerTypeExpressionToTargetTypeRef(type.elementType) };
    case "tuple":
      return { kind: "tuple", elements: type.elementTypes.map(providerTypeExpressionToTargetTypeRef) };
    case "function":
      return {
        kind: "function-pointer",
        args: type.parameters.map((parameter) => providerTypeExpressionToTargetTypeRef(parameter.type)),
        result: providerTypeExpressionToTargetTypeRef(type.returnType),
      };
    case "provider-ref":
      return { kind: "opaque", id: type.name };
    case "opaque":
      return { kind: "opaque", id: type.id };
    case "string":
      return csharpTargetNamedType("System.String");
    case "number":
      return csharpSourcePrimitiveTargetType("float64");
    case "any":
    case "unknown":
    case "void":
    case "never":
    case "object":
    case "union":
    case "intersection":
    case "literal":
      return { kind: "opaque", id: type.kind };
  }
}

function targetMemberNameFromProviderSignature(
  member: ProviderMemberDeclaration,
  signature: ProviderSignatureDeclaration,
): string | undefined {
  if (member.kind === "constructor") {
    return ".ctor";
  }
  return signature.name;
}
