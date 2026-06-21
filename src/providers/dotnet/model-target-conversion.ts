import type {
  TargetConstraint,
  TargetBindingFact,
  TargetMember,
  TargetParameter,
  TargetTypeParameter,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  DotnetConstraint,
  DotnetExportDeclaration,
  DotnetMemberDeclaration,
  DotnetParameterDeclaration,
  DotnetSignatureDeclaration,
  DotnetTypeDeclaration,
  DotnetTypeKind,
  DotnetTypeParameterDeclaration,
  DotnetTypeRef,
} from "./model-types.js";
import {
  dotnetTypeRefKey,
} from "./model-type-ref-key.js";
import {
  type CsharpTargetBindingFact,
  csharpDelegateTargetType,
  csharpQualifiedTypeRenderShape,
  csharpTargetNamedType,
} from "../../source/csharp-source-semantics/target-types.js";

export function dotnetConstraintToTargetConstraint(constraint: DotnetConstraint): TargetConstraint {
  switch (constraint.kind) {
    case "implements": {
      const contract = dotnetTypeRefToTargetTypeRef(constraint.contract);
      return contract.kind === "target-named"
        ? {
            kind: "implements",
            contract: contract.id,
            ...(contract.typeArguments !== undefined ? { typeArguments: contract.typeArguments } : {}),
          }
        : { kind: "target-specific", target: "csharp", name: "implements", value: contract };
    }
    case "value-type":
    case "reference-type":
    case "constructible":
    case "unmanaged":
      return { kind: constraint.kind };
    case "not-null":
      return { kind: "target-specific", target: "csharp", name: "not-null" };
    case "target-specific":
      return { kind: "target-specific", target: "csharp", name: constraint.name, value: constraint.value };
  }
}

export function dotnetExportToTargetBinding(declaration: DotnetExportDeclaration): TargetBindingFact | undefined {
  return declaration.kind === "type" ? dotnetTypeToTargetBinding(declaration) : undefined;
}

function dotnetTypeToTargetBinding(declaration: DotnetTypeDeclaration): TargetBindingFact {
  const binding = {
    id: declaration.metadataName,
    sourceName: declaration.sourceName,
    targetName: declaration.displayName ?? declaration.metadataName,
    target: "csharp",
    kind: dotnetTypeKindToTargetBindingKind(declaration.typeKind),
    csharpType: csharpTargetNamedType(
      declaration.metadataName,
      declaration.typeParameters?.map((parameter) => ({ kind: "type-parameter", name: parameter.name }) satisfies TargetTypeRef),
      declaration.displayName === undefined ? undefined : dotnetDisplayNameRenderShape(declaration.displayName),
    ),
    ...(declaration.typeParameters !== undefined && declaration.typeParameters.length > 0
      ? { typeParameters: declaration.typeParameters.map(dotnetTypeParameterToTargetTypeParameter) }
      : {}),
    ...(declaration.implementedContracts !== undefined && declaration.implementedContracts.length > 0
      ? { implementedContracts: declaration.implementedContracts.map(dotnetConstraintToTargetConstraint) }
      : {}),
    ...(declaration.members !== undefined && declaration.members.length > 0
      ? { members: declaration.members.flatMap((member) => dotnetMemberToTargetMembers(member, declaration.metadataName)) }
      : {}),
  } satisfies CsharpTargetBindingFact;
  return binding;
}

function dotnetTypeKindToTargetBindingKind(kind: DotnetTypeKind): TargetBindingFact["kind"] {
  switch (kind) {
    case "class":
    case "struct":
    case "interface":
    case "enum":
    case "delegate":
    case "opaque":
      return kind;
  }
}

function dotnetTypeParameterToTargetTypeParameter(parameter: DotnetTypeParameterDeclaration): TargetTypeParameter {
  return {
    name: parameter.name,
    ...(parameter.constraints !== undefined && parameter.constraints.length > 0
      ? { constraints: parameter.constraints.map(dotnetConstraintToTargetConstraint) }
      : {}),
    ...(parameter.variance !== undefined ? { variance: parameter.variance } : {}),
  };
}

function dotnetMemberToTargetMembers(member: DotnetMemberDeclaration, declaringTypeId: string): readonly TargetMember[] {
  switch (member.kind) {
    case "method":
    case "constructor":
    case "indexer":
    case "operator":
      return (member.signatures ?? []).map((signature) => dotnetSignatureToTargetMember(member, signature, declaringTypeId));
    case "property":
    case "field":
    case "event":
      return member.type === undefined
        ? []
        : [{
            id: member.metadataName,
            sourceName: member.sourceName,
            targetName: member.targetName,
            kind: member.kind,
            declaringType: csharpTargetNamedType(declaringTypeId),
            ...(member.static === true ? { static: true } : {}),
            parameters: [],
            returnType: dotnetTypeRefToTargetTypeRef(member.type),
          }];
  }
}

function dotnetSignatureToTargetMember(
  member: DotnetMemberDeclaration,
  signature: DotnetSignatureDeclaration,
  declaringTypeId: string,
): TargetMember {
  return {
    id: signature.id,
    sourceName: member.sourceName,
    targetName: signature.targetName ?? member.targetName,
    kind: member.kind,
    declaringType: csharpTargetNamedType(declaringTypeId),
    ...(member.static === true ? { static: true } : {}),
    parameters: signature.parameters.map(dotnetParameterToTargetParameter),
    ...(signature.returnType !== undefined ? { returnType: dotnetTypeRefToTargetTypeRef(signature.returnType) } : {}),
    ...(signature.typeParameters !== undefined && signature.typeParameters.length > 0
      ? { typeParameters: signature.typeParameters.map(dotnetTypeParameterToTargetTypeParameter) }
      : {}),
    overloadGroup: member.metadataName,
  };
}

function dotnetParameterToTargetParameter(parameter: DotnetParameterDeclaration): TargetParameter {
  return {
    name: parameter.name,
    type: dotnetTypeRefToTargetTypeRef(parameter.type),
    passingMode: parameter.passingMode,
    ...(parameter.optional === true ? { optional: true } : {}),
    ...(parameter.rest === true ? { paramsArray: true } : {}),
  };
}

export function dotnetTypeRefToTargetTypeRef(type: DotnetTypeRef): TargetTypeRef {
  switch (type.kind) {
    case "void":
      return csharpTargetNamedType("System.Void");
    case "any":
    case "unknown":
      return { kind: "opaque", id: type.kind };
    case "object":
      return csharpTargetNamedType("System.Object");
    case "string":
      return csharpTargetNamedType("System.String");
    case "boolean":
      return csharpTargetNamedType("System.Boolean");
    case "number":
      return csharpTargetNamedType("System.Double");
    case "bigint":
      return csharpTargetNamedType("System.Numerics.BigInteger", undefined, csharpQualifiedTypeRenderShape("System.Numerics", "BigInteger"));
    case "source-primitive":
      return { kind: "source-primitive", name: type.name };
    case "type-parameter":
      return { kind: "type-parameter", name: type.name };
    case "named":
      return csharpTargetNamedType(
        type.metadataName,
        type.typeArguments?.map(dotnetTypeRefToTargetTypeRef),
        type.displayName === undefined ? undefined : dotnetDisplayNameRenderShape(type.displayName),
      );
    case "array":
      return {
        kind: "array",
        element: dotnetTypeRefToTargetTypeRef(type.elementType),
        ...(type.rank !== undefined ? { rank: type.rank } : {}),
      };
    case "tuple":
      return { kind: "tuple", elements: type.elements.map(dotnetTypeRefToTargetTypeRef) };
    case "union":
      return { kind: "opaque", id: `csharp.union:${type.types.map(dotnetTypeRefKey).join("|")}` };
    case "function":
      return type.returnType.kind === "void"
        ? csharpDelegateTargetType(
            "System.Action",
            type.parameters.map((parameter) => dotnetTypeRefToTargetTypeRef(parameter.type)),
          )
        : csharpDelegateTargetType(
            "System.Func",
            type.parameters.map((parameter) => dotnetTypeRefToTargetTypeRef(parameter.type)),
            dotnetTypeRefToTargetTypeRef(type.returnType),
          );
    case "pointer":
      return { kind: "pointer", pointee: dotnetTypeRefToTargetTypeRef(type.pointee), mutability: type.mutability };
    case "function-pointer":
      return {
        kind: "function-pointer",
        args: type.args.map(dotnetTypeRefToTargetTypeRef),
        result: dotnetTypeRefToTargetTypeRef(type.result),
        ...(type.abi !== undefined ? { abi: type.abi } : {}),
      };
    case "opaque":
      return { kind: "opaque", id: type.id };
  }
}

function dotnetDisplayNameRenderShape(displayName: string): ReturnType<typeof csharpQualifiedTypeRenderShape> {
  const lastSeparator = displayName.lastIndexOf(".");
  return lastSeparator < 0
    ? { kind: "named", name: displayName }
    : csharpQualifiedTypeRenderShape(displayName.slice(0, lastSeparator), displayName.slice(lastSeparator + 1));
}
