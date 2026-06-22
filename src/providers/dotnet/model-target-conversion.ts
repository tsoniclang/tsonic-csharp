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
  DotnetRenderShape,
  DotnetSignatureDeclaration,
  DotnetTypeDeclaration,
  DotnetTypeKind,
  DotnetTypeParameterDeclaration,
  DotnetTypeRef,
} from "./model-types.js";
import {
  type CsharpTargetBindingFact,
  csharpBigIntegerTargetType,
  csharpBooleanTargetType,
  csharpDelegateTargetType,
  type CsharpTargetTypeRenderShape,
  csharpStringTargetType,
  csharpTargetNamedType,
  csharpVoidTargetType,
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
    declaration.renderShape === undefined ? undefined : dotnetRenderShapeToCsharpRenderShape(declaration.renderShape),
    csharpTargetMetadataFromDotnetTypeDeclaration(declaration),
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
      return csharpVoidTargetType();
    case "any":
    case "unknown":
      return { kind: "opaque", id: type.kind };
    case "object":
      return csharpTargetNamedType("System.Object", undefined, { kind: "predefined", name: "object" });
    case "string":
      return csharpStringTargetType();
    case "boolean":
      return csharpBooleanTargetType();
    case "number":
      return csharpTargetNamedType("System.Double", undefined, { kind: "predefined", name: "double" });
    case "bigint":
      return csharpBigIntegerTargetType();
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
        type.renderShape === undefined ? undefined : dotnetRenderShapeToCsharpRenderShape(type.renderShape),
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
): Parameters<typeof csharpTargetNamedType>[3] {
  const sourceShape = type.sourceShape;
  const base = csharpTargetMetadataFromDotnetMetadataName(type.metadataName);
  if (sourceShape?.kind !== "array") {
    return base;
  }
  const elementType = type.typeArguments?.length === 1
    ? type.typeArguments[0]
    : sourceShape.elementType;
  if (elementType === undefined) {
    return base;
  }
  return {
    ...base,
    arrayLiteralElementType: dotnetTypeRefToTargetTypeRef(elementType),
  };
}

function csharpTargetMetadataFromDotnetTypeDeclaration(
  declaration: DotnetTypeDeclaration,
): Parameters<typeof csharpTargetNamedType>[3] {
  return {
    ...csharpTargetMetadataFromDotnetMetadataName(declaration.metadataName),
    ...(declaration.typeKind === "struct" || declaration.typeKind === "enum" ? { valueType: true as const } : {}),
    ...(declaration.typeKind === "class" || declaration.typeKind === "interface" || declaration.typeKind === "enum"
      ? { sourceDeclarationKind: declaration.typeKind }
      : {}),
    ...(declaration.throwable === true ? { throwable: true as const } : {}),
  };
}

function csharpTargetMetadataFromDotnetMetadataName(
  metadataName: string,
): Parameters<typeof csharpTargetNamedType>[3] {
  switch (metadataName) {
    case "System.String":
      return { specialType: "string", typeofRuntimeKind: "string" };
    case "System.Void":
      return { specialType: "void" };
    case "System.Boolean":
      return { typeofRuntimeKind: "boolean", valueType: true };
    case "System.Numerics.BigInteger":
      return { typeofRuntimeKind: "bigint", valueType: true };
    case "System.Nullable`1":
      return { specialType: "nullable", valueType: true };
    default:
      return {};
  }
}

function dotnetRenderShapeToCsharpRenderShape(shape: DotnetRenderShape): CsharpTargetTypeRenderShape {
  switch (shape.kind) {
    case "named":
      return {
        kind: "named",
        ...(shape.namespace !== undefined && shape.namespace.length > 0 ? { namespace: shape.namespace } : {}),
        name: shape.name,
      };
  }
}
