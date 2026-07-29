import type {
  SourcePrimitiveKind,
} from "@tsonic/tsts";
import type {
  CsharpTargetNamedTypeRef,
  TargetTypeRef,
} from "./definitions.js";
import {
  csharpQualifiedTypeRenderShape,
} from "./render-shapes.js";
import {
  csharpTargetNamedType,
} from "./target-refs.js";

export interface CsharpSourcePrimitiveMetadata {
  readonly csharpPredefinedName: string;
  readonly dotnetMetadataName: string;
}

const csharpSourcePrimitiveMetadata = {
  bool: { csharpPredefinedName: "bool", dotnetMetadataName: "System.Boolean" },
  char: { csharpPredefinedName: "char", dotnetMetadataName: "System.Char" },
  int8: { csharpPredefinedName: "sbyte", dotnetMetadataName: "System.SByte" },
  uint8: { csharpPredefinedName: "byte", dotnetMetadataName: "System.Byte" },
  int16: { csharpPredefinedName: "short", dotnetMetadataName: "System.Int16" },
  uint16: { csharpPredefinedName: "ushort", dotnetMetadataName: "System.UInt16" },
  int32: { csharpPredefinedName: "int", dotnetMetadataName: "System.Int32" },
  uint32: { csharpPredefinedName: "uint", dotnetMetadataName: "System.UInt32" },
  int64: { csharpPredefinedName: "long", dotnetMetadataName: "System.Int64" },
  uint64: { csharpPredefinedName: "ulong", dotnetMetadataName: "System.UInt64" },
  "native-int": { csharpPredefinedName: "nint", dotnetMetadataName: "System.IntPtr" },
  "native-uint": { csharpPredefinedName: "nuint", dotnetMetadataName: "System.UIntPtr" },
  float16: { csharpPredefinedName: "Half", dotnetMetadataName: "System.Half" },
  float32: { csharpPredefinedName: "float", dotnetMetadataName: "System.Single" },
  float64: { csharpPredefinedName: "double", dotnetMetadataName: "System.Double" },
  decimal: { csharpPredefinedName: "decimal", dotnetMetadataName: "System.Decimal" },
  int128: { csharpPredefinedName: "Int128", dotnetMetadataName: "System.Int128" },
  uint128: { csharpPredefinedName: "UInt128", dotnetMetadataName: "System.UInt128" },
} satisfies Record<SourcePrimitiveKind, CsharpSourcePrimitiveMetadata>;

export function csharpSourcePrimitiveCsharpPredefinedName(kind: SourcePrimitiveKind): string {
  return csharpSourcePrimitiveMetadata[kind].csharpPredefinedName;
}

export function csharpSourcePrimitiveDotnetMetadataName(kind: SourcePrimitiveKind): string {
  return csharpSourcePrimitiveMetadata[kind].dotnetMetadataName;
}

export function csharpStringTargetType(): CsharpTargetNamedTypeRef {
  const type = csharpTargetNamedType("System.String", undefined, { kind: "predefined", name: "string" }, {
    specialType: "string",
    typeofRuntimeKind: "string",
  });
  const charType = csharpTargetNamedType(
    "System.Char",
    undefined,
    { kind: "predefined", name: "char" },
    { valueType: true },
  );
  return {
    ...type,
    csharpStringIteration: {
      lengthMemberName: "Length",
      substringMemberName: "Substring",
      highSurrogateMethod: {
        declaringType: charType,
        memberName: "IsHighSurrogate",
      },
      lowSurrogateMethod: {
        declaringType: charType,
        memberName: "IsLowSurrogate",
      },
    },
    csharpPropertyKeyIteration: {
      kind: "index",
      lengthMemberName: "Length",
      keyConversion: "invariant-string",
    },
  };
}

export function csharpObjectTargetType(): CsharpTargetNamedTypeRef {
  return csharpTargetNamedType(
    "System.Object",
    undefined,
    { kind: "predefined", name: "object" },
  );
}

export function csharpVoidTargetType(): CsharpTargetNamedTypeRef {
  return csharpTargetNamedType("System.Void", undefined, { kind: "predefined", name: "void" }, {
    specialType: "void",
  });
}

export function csharpBooleanTargetType(): CsharpTargetNamedTypeRef {
  return csharpTargetNamedType("System.Boolean", undefined, { kind: "predefined", name: "bool" }, {
    typeofRuntimeKind: "boolean",
    valueType: true,
  });
}

export function csharpBigIntegerTargetType(): CsharpTargetNamedTypeRef {
  return csharpTargetNamedType("System.Numerics.BigInteger", undefined, csharpQualifiedTypeRenderShape("System.Numerics", "BigInteger"), {
    typeofRuntimeKind: "bigint",
    valueType: true,
  });
}

export function csharpExceptionTargetType(): CsharpTargetNamedTypeRef {
  return csharpTargetNamedType("System.Exception", undefined, csharpQualifiedTypeRenderShape("System", "Exception"), {
    throwable: true,
  });
}

export function csharpSourcePrimitiveTargetType(kind: SourcePrimitiveKind): TargetTypeRef {
  return { kind: "source-primitive", name: kind };
}

export function csharpSourcePrimitiveRuntimeKind(
  kind: SourcePrimitiveKind,
): "string" | "number" | "boolean" | "bigint" {
  switch (kind) {
    case "bool":
      return "boolean";
    case "char":
      return "string";
    case "int64":
    case "uint64":
    case "int128":
    case "uint128":
      return "bigint";
    default:
      return "number";
  }
}
