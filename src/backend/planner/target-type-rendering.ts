import type { SourcePrimitiveKind, TargetTypeRef } from "@tsonic/tsts";
import type { CsharpTypeNode } from "../roslyn/syntax.js";
import { sanitizeIdentifier } from "./identifiers.js";

const primitiveTargetNames = new Map<SourcePrimitiveKind, string>([
  ["bool", "bool"],
  ["char", "char"],
  ["int8", "sbyte"],
  ["uint8", "byte"],
  ["int16", "short"],
  ["uint16", "ushort"],
  ["int32", "int"],
  ["uint32", "uint"],
  ["int64", "long"],
  ["uint64", "ulong"],
  ["native-int", "nint"],
  ["native-uint", "nuint"],
  ["float16", "Half"],
  ["float32", "float"],
  ["float64", "double"],
  ["decimal", "decimal"],
  ["int128", "Int128"],
  ["uint128", "UInt128"],
]);

const predefinedTargetIds = new Map<string, string>([
  ["System.Boolean", "bool"],
  ["System.Char", "char"],
  ["System.SByte", "sbyte"],
  ["System.Byte", "byte"],
  ["System.Int16", "short"],
  ["System.UInt16", "ushort"],
  ["System.Int32", "int"],
  ["System.UInt32", "uint"],
  ["System.Int64", "long"],
  ["System.UInt64", "ulong"],
  ["System.IntPtr", "nint"],
  ["System.UIntPtr", "nuint"],
  ["System.Half", "Half"],
  ["System.Single", "float"],
  ["System.Double", "double"],
  ["System.Decimal", "decimal"],
  ["System.Int128", "Int128"],
  ["System.UInt128", "UInt128"],
  ["System.String", "string"],
  ["System.Object", "object"],
  ["System.Void", "void"],
]);

export function csharpTypeFromTargetTypeRef(type: TargetTypeRef): CsharpTypeNode | undefined {
  switch (type.kind) {
    case "source-primitive":
      return csharpTypeFromSourcePrimitiveKind(type.name);
    case "target-named":
      return csharpTypeFromTargetNamedId(type.id, (type.typeArguments ?? []).map(csharpTypeFromTargetTypeRef));
    case "type-parameter":
      return { kind: "IdentifierName", name: sanitizeIdentifier(type.name) };
    case "array": {
      const elementType = csharpTypeFromTargetTypeRef(type.element);
      return elementType === undefined
        ? undefined
        : { kind: "ArrayType", elementType, ...(type.rank !== undefined ? { rank: type.rank } : {}) };
    }
    case "tuple": {
      const elements = type.elements.map(csharpTypeFromTargetTypeRef);
      return elements.some((element) => element === undefined)
        ? undefined
        : { kind: "TupleType", elements: elements as readonly CsharpTypeNode[] };
    }
    case "pointer": {
      const pointee = csharpTypeFromTargetTypeRef(type.pointee);
      return pointee === undefined
        ? undefined
        : { kind: "PointerType", pointee };
    }
    case "function-pointer": {
      const parameters = type.args.map(csharpTypeFromTargetTypeRef);
      const returnType = csharpTypeFromTargetTypeRef(type.result);
      return returnType === undefined || parameters.some((parameter) => parameter === undefined)
        ? undefined
        : { kind: "FunctionPointerType", parameters: parameters as readonly CsharpTypeNode[], returnType };
    }
    case "target-specific":
      return csharpTypeFromTargetSpecificRef(type);
    default:
      return undefined;
  }
}

export function csharpTypeFromSourcePrimitiveKind(kind: SourcePrimitiveKind): CsharpTypeNode {
  return {
    kind: "PredefinedType",
    name: primitiveTargetNames.get(kind)!,
  };
}

function csharpTypeFromTargetSpecificRef(type: Extract<TargetTypeRef, { readonly kind: "target-specific" }>): CsharpTypeNode | undefined {
  if (type.target !== "csharp" || type.name !== "project-source-type") {
    return undefined;
  }
  if (typeof type.value === "string") {
    return { kind: "IdentifierName", name: sanitizeIdentifier(type.value) };
  }
  if (typeof type.value !== "object" || type.value === null) {
    return undefined;
  }
  const value = type.value as { readonly name?: unknown; readonly typeArguments?: unknown };
  if (typeof value.name !== "string" || value.name.length === 0) {
    return undefined;
  }
  const rawArguments = Array.isArray(value.typeArguments) ? value.typeArguments : [];
  const typeArguments = rawArguments.map((argument) => csharpTypeFromTargetTypeRef(argument as TargetTypeRef));
  return typeArguments.some((argument) => argument === undefined)
    ? undefined
    : {
        kind: "IdentifierName",
        name: sanitizeIdentifier(value.name),
        ...(typeArguments.length > 0 ? { typeArguments: typeArguments as readonly CsharpTypeNode[] } : {}),
      };
}

function csharpTypeFromTargetNamedId(id: string, typeArguments: readonly (CsharpTypeNode | undefined)[]): CsharpTypeNode | undefined {
  const predefined = predefinedTargetIds.get(id);
  if (predefined !== undefined && typeArguments.length === 0) {
    return {
      kind: "PredefinedType",
      name: predefined,
    };
  }
  if (typeArguments.some((argument) => argument === undefined)) {
    return undefined;
  }
  if (stripMetadataArity(id) === "System.Nullable" && typeArguments.length === 1) {
    return {
      kind: "NullableType",
      inner: typeArguments[0]!,
    };
  }
  const genericPredefined = getGenericPredefinedTypeName(id);
  if (genericPredefined !== undefined) {
    return {
      kind: "IdentifierName",
      name: genericPredefined,
      typeArguments: typeArguments as readonly CsharpTypeNode[],
    };
  }
  const parts = id.split(".").filter((part) => part.length > 0);
  if (parts.length === 0) {
    return undefined;
  }
  const renderedParts = parts.map(stripMetadataArity).map(sanitizeIdentifier);
  const last = renderedParts[renderedParts.length - 1]!;
  const args = typeArguments as readonly CsharpTypeNode[];
  let current: CsharpTypeNode = { kind: "IdentifierName", name: renderedParts[0]! };
  for (let index = 1; index < renderedParts.length; index += 1) {
    current = {
      kind: "QualifiedName",
      left: current,
      name: renderedParts[index]!,
      ...(index === renderedParts.length - 1 && args.length > 0 ? { typeArguments: args } : {}),
    };
  }
  if (renderedParts.length === 1 && args.length > 0) {
    current = { kind: "IdentifierName", name: last, typeArguments: args };
  }
  return current;
}

function stripMetadataArity(name: string): string {
  const tick = name.indexOf("`");
  return tick < 0 ? name : name.slice(0, tick);
}

function getGenericPredefinedTypeName(id: string): string | undefined {
  const stripped = stripMetadataArity(id);
  switch (stripped) {
    case "System.Func":
      return "Func";
    case "System.Action":
      return "Action";
    case "System.Predicate":
      return "Predicate";
    default:
      return undefined;
  }
}
