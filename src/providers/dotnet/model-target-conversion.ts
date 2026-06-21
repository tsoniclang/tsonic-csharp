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
  return {
    id: declaration.metadataName,
    sourceName: declaration.sourceName,
    targetName: declaration.displayName ?? declaration.metadataName,
    target: "csharp",
    kind: dotnetTypeKindToTargetBindingKind(declaration.typeKind),
    ...(declaration.typeParameters !== undefined && declaration.typeParameters.length > 0
      ? { typeParameters: declaration.typeParameters.map(dotnetTypeParameterToTargetTypeParameter) }
      : {}),
    ...(declaration.implementedContracts !== undefined && declaration.implementedContracts.length > 0
      ? { implementedContracts: declaration.implementedContracts.map(dotnetConstraintToTargetConstraint) }
      : {}),
    ...(declaration.members !== undefined && declaration.members.length > 0
      ? { members: declaration.members.flatMap((member) => dotnetMemberToTargetMembers(member, declaration.metadataName)) }
      : {}),
  };
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
            declaringType: { kind: "target-named", id: declaringTypeId },
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
    declaringType: { kind: "target-named", id: declaringTypeId },
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
      return { kind: "opaque", id: "System.Void" };
    case "any":
    case "unknown":
      return { kind: "opaque", id: type.kind };
    case "object":
      return { kind: "target-named", id: "System.Object" };
    case "string":
      return { kind: "target-named", id: "System.String" };
    case "boolean":
      return { kind: "target-named", id: "System.Boolean" };
    case "number":
      return { kind: "target-named", id: "System.Double" };
    case "bigint":
      return { kind: "target-named", id: "System.Numerics.BigInteger" };
    case "source-primitive":
      return { kind: "source-primitive", name: type.name };
    case "type-parameter":
      return { kind: "type-parameter", name: type.name };
    case "named":
      return {
        kind: "target-named",
        id: type.metadataName,
        ...(type.typeArguments !== undefined ? { typeArguments: type.typeArguments.map(dotnetTypeRefToTargetTypeRef) } : {}),
      };
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
      return {
        kind: "target-named",
        id: type.returnType.kind === "void"
          ? `System.Action\`${type.parameters.length}`
          : `System.Func\`${type.parameters.length + 1}`,
        typeArguments: [
          ...type.parameters.map((parameter) => dotnetTypeRefToTargetTypeRef(parameter.type)),
          ...(type.returnType.kind === "void" ? [] : [dotnetTypeRefToTargetTypeRef(type.returnType)]),
        ],
      };
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
