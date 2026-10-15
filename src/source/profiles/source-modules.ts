import {
  sourcePrimitive,
} from "@tsonic/tsts";
import type {
  ProviderVirtualDeclarationFact,
  SourceSemanticsModule,
  SourcePrimitiveKind,
} from "@tsonic/tsts";
import {
  csharpLangModule,
  csharpTypesModule,
} from "../../target-model/identities/source.js";

const csharpPrimitiveAliasDeclarations = [
  sourcePrimitive("bool", "bool", "boolean"),
  sourcePrimitive("char", "char", "string", false, 16),
  sourcePrimitive("byte", "uint8", "number", false, 8),
  sourcePrimitive("sbyte", "int8", "number", true, 8),
  sourcePrimitive("short", "int16", "number", true, 16),
  sourcePrimitive("ushort", "uint16", "number", false, 16),
  sourcePrimitive("int", "int32", "number", true, 32),
  sourcePrimitive("uint", "uint32", "number", false, 32),
  sourcePrimitive("long", "int64", "bigint", true, 64),
  sourcePrimitive("ulong", "uint64", "bigint", false, 64),
  sourcePrimitive("nint", "native-int", "number", true),
  sourcePrimitive("nuint", "native-uint", "number", false),
  sourcePrimitive("float", "float32", "number", true, 32),
  sourcePrimitive("double", "float64", "number", true, 64),
  sourcePrimitive("decimal", "decimal", "number", true, 128),
] satisfies SourceSemanticsModule["exports"];

const csharpMarkerAliasDeclarations = [
  { kind: "call-marker", exportName: "out", marker: "write-only-reference" },
  { kind: "call-marker", exportName: "ref", marker: "read-write-reference" },
  { kind: "call-marker", exportName: "inref", marker: "read-only-reference" },
  { kind: "call-marker", exportName: "struct", marker: "struct" },
  { kind: "call-marker", exportName: "field", marker: "field" },
  { kind: "call-marker", exportName: "attribute", marker: "attribute" },
  { kind: "call-marker", exportName: "defaultof", marker: "default-value" },
  { kind: "type-marker", exportName: "fnptr", marker: "function-pointer" },
] satisfies SourceSemanticsModule["exports"];

export function csharpSourceSemanticsModules(): readonly SourceSemanticsModule[] {
  return [
    {
      moduleSpecifier: csharpTypesModule,
      packageName: "@tsonic/csharp",
      subpath: "types.js",
      capabilities: ["primitive"],
      exports: csharpPrimitiveAliasDeclarations,
    },
    {
      moduleSpecifier: csharpLangModule,
      packageName: "@tsonic/csharp",
      subpath: "lang.js",
      capabilities: ["call-marker", "type-marker"],
      exports: csharpMarkerAliasDeclarations,
    },
  ];
}

export function csharpSourcePrimitiveKindForProviderVirtualDeclaration(
  declaration: ProviderVirtualDeclarationFact | undefined,
): SourcePrimitiveKind | undefined {
  if (declaration?.moduleSpecifier !== csharpTypesModule || declaration.exportName === undefined) {
    return undefined;
  }
  return csharpSourcePrimitiveKindForExport(declaration.exportName);
}

export function csharpSourcePrimitiveKindForExport(exportName: string): SourcePrimitiveKind | undefined {
  const declaration = csharpPrimitiveAliasDeclarations.find((candidate) => candidate.exportName === exportName);
  return declaration?.primitive;
}
