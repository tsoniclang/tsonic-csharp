import type {
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  DotnetRenderShape,
  DotnetTypeDeclaration,
  DotnetTypeRef,
} from "../model-types.js";
import {
  csharpBigIntegerTargetType,
  csharpBooleanTargetType,
  csharpDelegateTargetType,
  type CsharpDelegateSignatureShape,
  csharpQualifiedTypeRenderShape,
  csharpNullableValueTargetType,
  type CsharpTargetTypeRenderShape,
  csharpStringTargetType,
  csharpTargetNamedType,
  csharpVoidTargetType,
} from "../../../source/csharp-source-semantics/target-types.js";

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
    case "literal":
      throw new Error("Literal is a source declaration shape only and cannot be emitted as a target type.");
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
      const targetId = requireDotnetTargetId(type.targetId, type.metadataName);
      return csharpTargetNamedType(
        targetId,
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
    case "nullable":
      return csharpNullableValueTargetType(dotnetTypeRefToTargetTypeRef(type.elementType));
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

export function requireDotnetTargetId(targetId: string | undefined, metadataName: string): string {
  if (typeof targetId !== "string" || targetId.length === 0) {
    throw new Error(`Missing canonical .NET targetId for '${metadataName}'. .NET target facts must be assembly-qualified and must not fall back to metadataName.`);
  }
  return targetId;
}

export function csharpTargetMetadataFromDotnetTypeDeclaration(
  declaration: DotnetTypeDeclaration,
): Parameters<typeof csharpTargetNamedType>[3] {
  const delegateSignature = dotnetDelegateSignatureFromSourceShape(declaration.sourceShape);
  return {
    ...(declaration.typeKind === "struct" || declaration.typeKind === "enum" ? { valueType: true as const } : {}),
    ...(declaration.typeKind === "class" || declaration.typeKind === "interface" || declaration.typeKind === "enum"
      ? { sourceDeclarationKind: declaration.typeKind }
      : {}),
    ...(declaration.throwable === true ? { throwable: true as const } : {}),
    ...(delegateSignature !== undefined ? { delegateSignature } : {}),
  };
}

export function dotnetRenderShapeToCsharpRenderShape(shape: DotnetRenderShape): CsharpTargetTypeRenderShape {
  switch (shape.kind) {
    case "named":
      return {
        kind: "named",
        ...(shape.namespace !== undefined && shape.namespace.length > 0 ? { namespace: shape.namespace } : {}),
        name: shape.name,
      };
  }
}

function csharpTargetMetadataFromDotnetTypeRef(
  type: Extract<DotnetTypeRef, { readonly kind: "named" }>,
): Parameters<typeof csharpTargetNamedType>[3] {
  const sourceShape = type.sourceShape;
  const delegateSignature = dotnetDelegateSignatureFromSourceShape(sourceShape);
  const elementType = sourceShape?.kind === "array"
    ? type.typeArguments?.length === 1
      ? type.typeArguments[0]
      : sourceShape.elementType
    : undefined;
  const arrayLiteralElementType = elementType === undefined ? undefined : dotnetTypeRefToTargetTypeRef(elementType);
  const arrayLiteralConstructionType = arrayLiteralElementType === undefined
    ? undefined
    : dotnetArrayLiteralConstructionType(type, arrayLiteralElementType);
  return {
    ...(arrayLiteralElementType !== undefined ? { arrayLiteralElementType } : {}),
    ...(arrayLiteralConstructionType !== undefined ? { arrayLiteralConstructionType } : {}),
    ...(delegateSignature !== undefined ? { delegateSignature } : {}),
  };
}

function dotnetArrayLiteralConstructionType(
  type: Extract<DotnetTypeRef, { readonly kind: "named" }>,
  elementType: TargetTypeRef,
): TargetTypeRef | undefined {
  const metadataName = type.metadataName;
  if (metadataName === "System.Collections.Generic.List`1") {
    return csharpTargetNamedType(
      requireDotnetTargetId(type.targetId, type.metadataName),
      type.typeArguments?.map(dotnetTypeRefToTargetTypeRef),
      type.renderShape === undefined ? csharpQualifiedTypeRenderShape("System.Collections.Generic", "List") : dotnetRenderShapeToCsharpRenderShape(type.renderShape),
      {
        arrayLiteralElementType: elementType,
        enumerableElementType: elementType,
        readOnlyIndexableElementType: elementType,
        denseMutableElementType: elementType,
      },
    );
  }
  if (
    metadataName === "System.Collections.Generic.IEnumerable`1" ||
    metadataName === "System.Collections.Generic.IReadOnlyCollection`1" ||
    metadataName === "System.Collections.Generic.IReadOnlyList`1" ||
    metadataName === "System.Collections.Generic.ICollection`1" ||
    metadataName === "System.Collections.Generic.IList`1"
  ) {
    return csharpTargetNamedType(
      "System.Collections.Generic.List`1",
      [elementType],
      csharpQualifiedTypeRenderShape("System.Collections.Generic", "List"),
      {
        arrayLiteralElementType: elementType,
        enumerableElementType: elementType,
        readOnlyIndexableElementType: elementType,
        denseMutableElementType: elementType,
      },
    );
  }
  return undefined;
}

function dotnetDelegateSignatureFromSourceShape(
  sourceShape: DotnetTypeRef | undefined,
): CsharpDelegateSignatureShape | undefined {
  if (sourceShape?.kind !== "function") {
    return undefined;
  }
  const parameters = sourceShape.parameters.map((parameter) => dotnetTypeRefToTargetTypeRef(parameter.type));
  return {
    parameters,
    returnType: dotnetTypeRefToTargetTypeRef(sourceShape.returnType),
  };
}
