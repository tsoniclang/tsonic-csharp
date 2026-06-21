import {
  targetBindingFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
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
  csharpSourcePrimitiveTargetType,
  csharpTargetNamedType,
} from "./target-types.js";
import {
  findCsharpDotnetProviderExportByTargetId,
} from "../../providers/dotnet/index.js";

export function findTargetBinding(
  context: ExtensionObservationContext,
  subjects: readonly (ExtensionFactSubject | undefined)[],
): TargetBindingFact | undefined {
  for (const subject of subjects) {
    const binding = resolveTargetBinding(subject, context);
    if (binding !== undefined) {
      return binding;
    }
  }
  return undefined;
}

export function resolveTargetBinding(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): TargetBindingFact | undefined {
  return subject === undefined ? undefined : context.factResolver.resolve(subject, targetBindingFactKey);
}

export function getKnownTargetBindingForTypeRef(type: TargetTypeRef | undefined): TargetBindingFact | undefined {
  if (type?.kind !== "target-named") {
    return undefined;
  }
  const declaration = findCsharpTargetProviderDeclaration(type.id);
  return declaration === undefined ? undefined : providerDeclarationToTargetBinding(declaration);
}

function findCsharpTargetProviderDeclaration(targetId: string): ProviderExportDeclaration | undefined {
  return findCsharpDotnetProviderExportByTargetId(targetId);
}

function providerDeclarationToTargetBinding(declaration: ProviderExportDeclaration): TargetBindingFact | undefined {
  if (declaration.targetIdentity?.target !== csharpTargetId) {
    return undefined;
  }
  const kind = providerDeclarationKindToTargetBindingKind(declaration.kind);
  if (kind === undefined) {
    return undefined;
  }
  return {
    id: declaration.targetIdentity.id,
    sourceName: declaration.name,
    targetName: declaration.targetIdentity.displayName ?? declaration.targetIdentity.id,
    target: csharpTargetId,
    kind,
    ...(declaration.typeParameters !== undefined && declaration.typeParameters.length > 0
      ? { typeParameters: declaration.typeParameters.map(providerTypeParameterToTargetTypeParameter) }
      : {}),
    ...(declaration.members !== undefined
      ? { members: declaration.members.flatMap((member) => providerMemberToTargetMembers(member, declaration.targetIdentity!.id)) }
      : {}),
  };
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

function providerMemberToTargetMembers(member: ProviderMemberDeclaration, declaringTypeId: string): readonly TargetMember[] {
  switch (member.kind) {
    case "property":
    case "field":
      return member.type === undefined
        ? []
        : [{
            id: member.id,
            sourceName: member.name,
            targetName: targetMemberNameFromProviderMember(member),
            kind: member.kind,
            parameters: [],
            returnType: providerTypeExpressionToTargetTypeRef(member.type),
            declaringType: csharpTargetNamedType(declaringTypeId),
            ...(member.static === true ? { static: true } : {}),
          }];
    case "method":
    case "constructor":
    case "indexer":
      return (member.signatures ?? []).map((signature) =>
        providerSignatureToTargetMember(member, signature, declaringTypeId)
      );
  }
}

function providerSignatureToTargetMember(
  member: ProviderMemberDeclaration,
  signature: ProviderSignatureDeclaration,
  declaringTypeId: string,
): TargetMember {
  const kind = member.kind;
  return {
    id: signature.id,
    sourceName: member.name,
    targetName: targetMemberNameFromProviderSignature(member, signature),
    kind,
    declaringType: csharpTargetNamedType(declaringTypeId),
    ...(member.static === true ? { static: true } : {}),
    parameters: signature.parameters.map(providerParameterToTargetParameter),
    ...(signature.returnType !== undefined ? { returnType: providerTypeExpressionToTargetTypeRef(signature.returnType) } : {}),
    ...(signature.typeParameters !== undefined && signature.typeParameters.length > 0
      ? { typeParameters: signature.typeParameters.map(providerTypeParameterToTargetTypeParameter) }
      : {}),
  };
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

function targetMemberNameFromProviderMember(member: ProviderMemberDeclaration): string {
  return targetMemberNameFromId(member.id);
}

function targetMemberNameFromProviderSignature(
  member: ProviderMemberDeclaration,
  signature: ProviderSignatureDeclaration,
): string {
  if (member.kind === "constructor") {
    return ".ctor";
  }
  return signature.name ?? targetMemberNameFromId(signature.id);
}

function targetMemberNameFromId(id: string): string {
  const paren = id.indexOf("(");
  const qualifiedName = paren === -1 ? id : id.slice(0, paren);
  const lastDot = qualifiedName.lastIndexOf(".");
  return qualifiedName.slice(lastDot + 1);
}
