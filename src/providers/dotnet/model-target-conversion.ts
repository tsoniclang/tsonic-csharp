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
  type CsharpTargetBindingFact,
  csharpDelegateTargetType,
  csharpQualifiedTypeRenderShape,
  csharpTargetNamedType,
} from "../../source/csharp-source-semantics/target-types.js";

export function dotnetConstraintToTargetConstraint(constraint: DotnetConstraint): TargetConstraint {
  switch (constraint.kind) {
    case "implements": {
      const contract = dotnetTypeRefToTargetTypeRef(constraint.contract);
      if (contract.kind !== "target-named") {
        throw new Error(`Unsupported .NET target constraint 'implements' for non-named contract '${contract.kind}'. Add a typed TSTS target constraint before exposing this declaration.`);
      }
      return {
        kind: "implements",
        contract: contract.id,
        ...(contract.typeArguments !== undefined ? { typeArguments: contract.typeArguments } : {}),
      };
    }
    case "value-type":
    case "reference-type":
    case "constructible":
    case "unmanaged":
      return { kind: constraint.kind };
    case "not-null":
      throw new Error("Unsupported .NET target constraint 'not-null'. Add a typed TSTS target constraint before exposing this declaration.");
    case "target-specific":
      throw new Error(`Unsupported .NET target-specific constraint '${constraint.name}'. Add a typed TSTS target constraint before exposing this declaration.`);
  }
}

export function dotnetExportToTargetBinding(declaration: DotnetExportDeclaration): TargetBindingFact | undefined {
  return declaration.kind === "type" ? dotnetTypeToTargetBinding(declaration) : undefined;
}

function dotnetTypeToTargetBinding(declaration: DotnetTypeDeclaration): TargetBindingFact {
  const declaredCsharpType = csharpTargetNamedType(
    declaration.metadataName,
    declaration.typeParameters?.map((parameter) => ({ kind: "type-parameter", name: parameter.name }) satisfies TargetTypeRef),
    declaration.displayName === undefined ? undefined : dotnetDisplayNameRenderShape(declaration.displayName),
  );
  const baseType = declaration.baseType === undefined
    ? undefined
    : dotnetTypeRefToTargetTypeRef(declaration.baseType);
  const binding = {
    id: declaration.metadataName,
    sourceName: declaration.sourceName,
    targetName: declaration.displayName ?? declaration.metadataName,
    target: "csharp",
    kind: dotnetTypeKindToTargetBindingKind(declaration.typeKind),
    csharpType: declaredCsharpType,
    ...(baseType !== undefined ? { csharpBaseType: baseType } : {}),
    ...(declaration.typeParameters !== undefined && declaration.typeParameters.length > 0
      ? { typeParameters: declaration.typeParameters.map(dotnetTypeParameterToTargetTypeParameter) }
      : {}),
    ...(declaration.implementedContracts !== undefined && declaration.implementedContracts.length > 0
      ? { implementedContracts: declaration.implementedContracts.map(dotnetConstraintToTargetConstraint) }
      : {}),
    ...(declaration.members !== undefined && declaration.members.length > 0
      ? { members: declaration.members.flatMap((member) => dotnetMemberToTargetMembers(member, declaredCsharpType)) }
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

function dotnetMemberToTargetMembers(member: DotnetMemberDeclaration, declaringType: TargetTypeRef): readonly TargetMember[] {
  switch (member.kind) {
    case "method":
    case "constructor":
    case "indexer":
    case "operator":
      return (member.signatures ?? []).map((signature) => dotnetSignatureToTargetMember(member, signature, declaringType));
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
            declaringType,
            ...(member.static === true ? { static: true } : {}),
            parameters: [],
            returnType: dotnetTypeRefToTargetTypeRef(member.type),
          }];
  }
}

function dotnetSignatureToTargetMember(
  member: DotnetMemberDeclaration,
  signature: DotnetSignatureDeclaration,
  declaringType: TargetTypeRef,
): TargetMember {
  return {
    id: signature.id,
    sourceName: member.sourceName,
    targetName: signature.targetName ?? member.targetName,
    kind: member.kind,
    declaringType,
    ...(member.static === true ? { static: true } : {}),
    parameters: signature.parameters.map(dotnetParameterToTargetParameter),
    ...(signature.returnType !== undefined ? { returnType: dotnetTypeRefToTargetTypeRef(signature.returnType) } : {}),
    ...(signature.typeParameters !== undefined && signature.typeParameters.length > 0
      ? { typeParameters: signature.typeParameters.map(dotnetTypeParameterToTargetTypeParameter) }
      : {}),
    overloadGroup: dotnetTargetMemberOverloadGroup(member),
  };
}

function dotnetTargetMemberOverloadGroup(member: DotnetMemberDeclaration): string {
  return member.kind === "constructor"
    ? dotnetMetadataNameWithoutSignature(member.metadataName)
    : member.metadataName;
}

function dotnetMetadataNameWithoutSignature(metadataName: string): string {
  const signatureStart = metadataName.indexOf("(");
  return signatureStart === -1 ? metadataName : metadataName.slice(0, signatureStart);
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
    case "provider-ref":
      throw new Error("Provider-ref is a source declaration shape only and cannot be emitted as a target type.");
    case "named":
      return csharpTargetNamedType(
        type.metadataName,
        type.typeArguments?.map(dotnetTypeRefToTargetTypeRef),
        type.displayName === undefined ? undefined : dotnetDisplayNameRenderShape(type.displayName),
        csharpTargetMetadataFromDotnetTypeRef(type),
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
      throw new Error("Unsupported .NET union target type. Add a typed TSTS target union/carrier model before exposing this declaration.");
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

function csharpTargetMetadataFromDotnetTypeRef(
  type: Extract<DotnetTypeRef, { readonly kind: "named" }>,
): { readonly arrayLiteralElementType?: TargetTypeRef } {
  const sourceShape = type.sourceShape;
  if (sourceShape?.kind !== "array") {
    return {};
  }
  const elementType = type.typeArguments?.length === 1
    ? type.typeArguments[0]
    : sourceShape.elementType;
  if (elementType === undefined) {
    return {};
  }
  return {
    arrayLiteralElementType: dotnetTypeRefToTargetTypeRef(elementType),
  };
}

function dotnetDisplayNameRenderShape(displayName: string): ReturnType<typeof csharpQualifiedTypeRenderShape> {
  const lastSeparator = displayName.lastIndexOf(".");
  const name = stripGenericArity(lastSeparator < 0 ? displayName : displayName.slice(lastSeparator + 1));
  return lastSeparator < 0
    ? { kind: "named", name }
    : csharpQualifiedTypeRenderShape(displayName.slice(0, lastSeparator), name);
}

function stripGenericArity(name: string): string {
  const tick = name.indexOf("`");
  return tick < 0 ? name : name.slice(0, tick);
}
