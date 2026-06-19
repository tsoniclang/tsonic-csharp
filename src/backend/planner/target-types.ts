import type { SourcePrimitiveKind, TargetTypeRef } from "@tsonic/tsts";
import type { CsharpTypeNode } from "../ast/csharp-ast.js";
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
      return { kind: "named", name: sanitizeIdentifier(type.name) };
    case "array": {
      const elementType = csharpTypeFromTargetTypeRef(type.element);
      return elementType === undefined
        ? undefined
        : { kind: "array", elementType, ...(type.rank !== undefined ? { rank: type.rank } : {}) };
    }
    default:
      return undefined;
  }
}

export function csharpTypeFromSourcePrimitiveKind(kind: SourcePrimitiveKind): CsharpTypeNode {
  return {
    kind: "predefined",
    name: primitiveTargetNames.get(kind)!,
  };
}

function csharpTypeFromTargetNamedId(id: string, typeArguments: readonly (CsharpTypeNode | undefined)[]): CsharpTypeNode | undefined {
  const predefined = predefinedTargetIds.get(id);
  if (predefined !== undefined && typeArguments.length === 0) {
    return {
      kind: "predefined",
      name: predefined,
    };
  }
  if (typeArguments.some((argument) => argument === undefined)) {
    return undefined;
  }
  const parts = id.split(".").filter((part) => part.length > 0);
  if (parts.length === 0) {
    return undefined;
  }
  const renderedParts = parts.map(stripMetadataArity).map(sanitizeIdentifier);
  const last = renderedParts[renderedParts.length - 1]!;
  const args = typeArguments as readonly CsharpTypeNode[];
  let current: CsharpTypeNode = { kind: "named", name: renderedParts[0]! };
  for (let index = 1; index < renderedParts.length; index += 1) {
    current = {
      kind: "qualified",
      left: current,
      name: renderedParts[index]!,
      ...(index === renderedParts.length - 1 && args.length > 0 ? { typeArguments: args } : {}),
    };
  }
  if (renderedParts.length === 1 && args.length > 0) {
    current = { kind: "named", name: last, typeArguments: args };
  }
  return current;
}

function stripMetadataArity(name: string): string {
  const tick = name.indexOf("`");
  return tick < 0 ? name : name.slice(0, tick);
}
