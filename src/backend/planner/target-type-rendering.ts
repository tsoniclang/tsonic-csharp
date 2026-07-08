import type { SourcePrimitiveKind, TargetTypeRef } from "@tsonic/tsts";
import type { CsharpTypeNode } from "../roslyn/syntax.js";
import { csharpTupleType } from "./csharp-tuples.js";
import { sanitizeIdentifier, tryCsharpIdentifier } from "./identifiers.js";
import type {
  CsharpTargetTypeRenderShape,
} from "../../source/csharp-source-semantics/target-types.js";
import {
  csharpRenderShapeForTargetNamedType,
  csharpSourcePrimitiveCsharpPredefinedName,
  isCsharpNullableReferenceTargetType,
} from "../../source/csharp-source-semantics/target-types.js";

export function csharpTypeFromTargetTypeRef(type: TargetTypeRef): CsharpTypeNode | undefined {
  const rendered = csharpTypeFromEnrichedTargetTypeRef(type);
  return rendered === undefined
    ? undefined
    : isCsharpNullableReferenceTargetType(type) && rendered.kind !== "NullableType"
      ? { kind: "NullableType", inner: rendered }
      : rendered;
}

function csharpTypeFromEnrichedTargetTypeRef(type: TargetTypeRef): CsharpTypeNode | undefined {
  switch (type.kind) {
    case "source-primitive":
      return csharpTypeFromSourcePrimitiveKind(type.name);
    case "target-named":
      return csharpTypeFromTargetNamedType(type);
    case "type-parameter":
      return csharpTypeParameterName(type.name);
    case "array": {
      const elementType = csharpTypeFromEnrichedTargetTypeRef(type.element);
      return elementType === undefined
        ? undefined
        : { kind: "ArrayType", elementType, ...(type.rank !== undefined ? { rank: type.rank } : {}) };
    }
    case "tuple": {
      const elements = type.elements.map(csharpTypeFromEnrichedTargetTypeRef);
      return elements.some((element) => element === undefined)
        ? undefined
        : csharpTupleType(elements as readonly CsharpTypeNode[]);
    }
    case "pointer": {
      const pointee = csharpTypeFromEnrichedTargetTypeRef(type.pointee);
      return pointee === undefined
        ? undefined
        : { kind: "PointerType", pointee };
    }
    case "function-pointer": {
      const parameters = type.args.map(csharpTypeFromEnrichedTargetTypeRef);
      const returnType = csharpTypeFromEnrichedTargetTypeRef(type.result);
      return returnType === undefined || parameters.some((parameter) => parameter === undefined)
        ? undefined
        : { kind: "FunctionPointerType", parameters: parameters as readonly CsharpTypeNode[], returnType };
    }
    case "target-specific":
      return undefined;
    default:
      return undefined;
  }
}

function csharpTypeParameterName(name: string): CsharpTypeNode | undefined {
  const identifier = tryCsharpIdentifier(name);
  return identifier === undefined ? undefined : { kind: "IdentifierName", name: identifier };
}

export function csharpTypeFromSourcePrimitiveKind(kind: SourcePrimitiveKind): CsharpTypeNode {
  return {
    kind: "PredefinedType",
    name: csharpSourcePrimitiveCsharpPredefinedName(kind),
  };
}

function csharpTypeFromTargetNamedType(type: Extract<TargetTypeRef, { readonly kind: "target-named" }>): CsharpTypeNode | undefined {
  const typeArguments = (type.typeArguments ?? []).map(csharpTypeFromEnrichedTargetTypeRef);
  if (typeArguments.some((argument) => argument === undefined)) {
    return undefined;
  }
  const shape = csharpRenderShapeForTargetNamedType(type);
  if (shape === undefined) {
    return undefined;
  }
  switch (shape.kind) {
    case "predefined":
      return typeArguments.length === 0 ? { kind: "PredefinedType", name: shape.name } : undefined;
    case "nullable":
      return typeArguments.length === 1 ? { kind: "NullableType", inner: typeArguments[0]! } : undefined;
    case "named":
      return csharpNamedTypeFromRenderShape(shape, typeArguments as readonly CsharpTypeNode[]);
  }
}

function csharpNamedTypeFromRenderShape(
  shape: Extract<CsharpTargetTypeRenderShape, { readonly kind: "named" }>,
  typeArguments: readonly CsharpTypeNode[],
): CsharpTypeNode | undefined {
  const namespaceParts = (shape.namespace ?? []).map(sanitizeIdentifier);
  const segments = [
    { name: shape.name, genericArity: shape.genericArity },
    ...(shape.nested ?? []),
  ];
  let current: CsharpTypeNode | undefined;
  for (const namespacePart of namespaceParts) {
    current = current === undefined
      ? { kind: "IdentifierName", name: namespacePart }
      : { kind: "QualifiedName", left: current, name: namespacePart };
  }
  let argumentOffset = 0;
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]!;
    const arity = segment.genericArity ?? (shape.nested === undefined && index === segments.length - 1
      ? typeArguments.length - argumentOffset
      : 0);
    const segmentTypeArguments = arity === 0 ? [] : typeArguments.slice(argumentOffset, argumentOffset + arity);
    if (segmentTypeArguments.length !== arity) {
      return undefined;
    }
    argumentOffset += arity;
    const name = sanitizeIdentifier(segment.name);
    if (current === undefined) {
      current = {
        kind: "IdentifierName",
        name,
        ...(segmentTypeArguments.length > 0 ? { typeArguments: segmentTypeArguments } : {}),
      };
      continue;
    }
    current = {
      kind: "QualifiedName",
      left: current,
      name,
      ...(segmentTypeArguments.length > 0 ? { typeArguments: segmentTypeArguments } : {}),
    };
  }
  if (argumentOffset !== typeArguments.length) {
    return undefined;
  }
  return current;
}
