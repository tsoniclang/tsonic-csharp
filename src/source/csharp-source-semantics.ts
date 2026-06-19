import { TstsProviderContractVersion, acceptDecision, createSourceSemanticsExtension, deferDecision, getTypeScriptArrayElementType, isTypeScriptStringLikeType, sourcePrimitive } from "@tsonic/tsts";
import type {
  CompilerExtension,
  ExtensionDiagnostic,
  ExtensionFactSubject,
  ProviderDeclarationModel,
  ProviderExportDeclaration,
  ProviderIdentity,
  ProviderMemberDeclaration,
  ProviderModuleContext,
  ProviderModuleResolution,
  ProviderOwnership,
  ProviderTypeExpression,
  SourceCallMarkerDeclaration,
  SourcePrimitiveDeclaration,
  SourcePrimitiveKind,
  SourceSemanticsExportDeclaration,
  SourceSemanticsModule,
  SourceTypeMarkerDeclaration,
  TargetBindingProvider,
  TargetIterationFact,
  TargetOperationFact,
  TargetSemanticProvider,
  Type,
} from "@tsonic/tsts";
import type { TargetExtensionContext } from "@tsonic/target-api";

export const neutralTypesModule = "@tsonic/core/types.js";
export const csharpTypesModule = "@tsonic/csharp/types.js";
export const neutralLangModule = "@tsonic/core/lang.js";
export const csharpLangModule = "@tsonic/csharp/lang.js";

type AttributeBuilderTypeName =
  | "AttributeBuilder"
  | "AttributeMemberBuilder"
  | "AttributeMethodBuilder"
  | "AttributeParameterBuilder";

const attributeTargetTypeName = "__TsonicCsharpAttributeTarget";
const attributeArgumentTypeName = "__TsonicCsharpAttributeArgument";

export function createCsharpSourceSemanticsExtension(_context: TargetExtensionContext): CompilerExtension {
  return createSourceSemanticsExtension({
    identity: {
      id: "tsonic.csharp.source-semantics",
      version: "0.0.1",
      capabilityNamespace: "tsonic.csharp.source",
    },
    modules: csharpSourceSemanticsModules(),
  });
}

export function createCsharpCoreVirtualModulesExtension(_context: TargetExtensionContext): CompilerExtension {
  return {
    identity: {
      id: "tsonic.csharp.core-virtual-modules",
      version: "0.0.1",
      capabilityNamespace: "tsonic.csharp.core-modules",
    },
    composition: {
      kind: "target",
      target: "csharp",
    },
    initialize(context): void {
      context.registerTargetBindingProvider(createCsharpCoreVirtualModulesProvider());
    },
  };
}

export function createCsharpSurfaceOperationsExtension(_context: TargetExtensionContext): CompilerExtension {
  return {
    identity: {
      id: "tsonic.csharp.surface-operations",
      version: "0.0.1",
      capabilityNamespace: "tsonic.csharp.surface-operations",
    },
    composition: {
      kind: "target",
      target: "csharp",
    },
    initialize(context): void {
      const provider = createCsharpSurfaceOperationsProvider();
      context.registerTargetSemanticProvider(provider);
    },
  };
}

function createCsharpSurfaceOperationsProvider(): TargetSemanticProvider {
  return {
    identity: {
      id: "tsonic.csharp.surface-operations",
      version: "0.0.1",
      target: "csharp",
      extensionContractVersion: TstsProviderContractVersion,
      providerKind: "semantic",
    },
    resolvePropertyAccess(request) {
      if (request.target !== undefined && request.target !== "csharp") {
        return deferDecision;
      }
      if (request.propertyName === "length" && isTypeScriptStringLikeType(request.receiverType as Type | undefined)) {
        const resultType = sourcePrimitiveInt32();
        return acceptDecision({
          operation: {
            operationId: "System.String.Length",
            operationKind: "property",
            targetOperation: "Length",
            resultType,
          } satisfies TargetOperationFact,
          resultType,
        });
      }
      if (request.propertyName === "length" && getTypeScriptArrayElementType(request.receiverType as Type | undefined) !== undefined) {
        const resultType = sourcePrimitiveInt32();
        return acceptDecision({
          operation: {
            operationId: "System.Array.Length",
            operationKind: "property",
            targetOperation: "Length",
            resultType,
          } satisfies TargetOperationFact,
          resultType,
        });
      }
      return deferDecision;
    },
    resolveElementAccess(request) {
      if (request.target !== undefined && request.target !== "csharp") {
        return deferDecision;
      }
      const elementType = getTypeScriptArrayElementType(request.receiverType as Type | undefined);
      if (elementType === undefined) {
        return deferDecision;
      }
      return acceptDecision({
        operation: {
          operationId: "System.Array.GetItem",
          operationKind: "indexer",
          targetOperation: "[]",
          resultType: elementType,
        } satisfies TargetOperationFact,
        resultType: elementType,
      });
    },
    resolveIteration(request) {
      if (request.target !== undefined && request.target !== "csharp") {
        return deferDecision;
      }
      if (request.iterationKind !== "sync") {
        return deferDecision;
      }
      const elementType = getTypeScriptArrayElementType(request.iterableType as Type | undefined);
      if (elementType === undefined) {
        return deferDecision;
      }
      return acceptDecision({
        iteration: {
          operationId: "System.Array.Enumerate",
          iterationKind: "sync",
          targetOperation: "foreach",
          elementType,
        } satisfies TargetIterationFact,
        elementType,
      });
    },
  };
}

function sourcePrimitiveInt32(): ExtensionFactSubject {
  return {
    kind: "source-primitive",
    name: "int32",
  };
}

function csharpSourceSemanticsModules(): readonly SourceSemanticsModule[] {
  return [
    {
      moduleSpecifier: neutralTypesModule,
      packageName: "@tsonic/core",
      subpath: "types.js",
      exports: [
        sourcePrimitive("bool", "bool", "boolean"),
        sourcePrimitive("char16", "char16", "string", false, 16),
        sourcePrimitive("int8", "int8", "number", true, 8),
        sourcePrimitive("uint8", "uint8", "number", false, 8),
        sourcePrimitive("int16", "int16", "number", true, 16),
        sourcePrimitive("uint16", "uint16", "number", false, 16),
        sourcePrimitive("int32", "int32", "number", true, 32),
        sourcePrimitive("uint32", "uint32", "number", false, 32),
        sourcePrimitive("int64", "int64", "bigint", true, 64),
        sourcePrimitive("uint64", "uint64", "bigint", false, 64),
        sourcePrimitive("int128", "int128", "bigint", true, 128),
        sourcePrimitive("uint128", "uint128", "bigint", false, 128),
        sourcePrimitive("nativeInt", "native-int", "number", true),
        sourcePrimitive("nativeUint", "native-uint", "number", false),
        sourcePrimitive("float16", "float16", "number", true, 16),
        sourcePrimitive("float32", "float32", "number", true, 32),
        sourcePrimitive("float64", "float64", "number", true, 64),
        sourcePrimitive("decimal128", "decimal128", "number", true, 128),
        sourcePrimitive("char32", "char32", "string", false, 32),
      ],
    },
    {
      moduleSpecifier: csharpTypesModule,
      packageName: "@tsonic/csharp",
      subpath: "types.js",
      exports: [
        sourcePrimitive("bool", "bool", "boolean"),
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
        sourcePrimitive("decimal", "decimal128", "number", true, 128),
        sourcePrimitive("char", "char16", "string", false, 16),
      ],
    },
    {
      moduleSpecifier: neutralLangModule,
      packageName: "@tsonic/core",
      subpath: "lang.js",
      exports: [
        { kind: "call-marker", exportName: "writeonlyRef", marker: "byrefWriteonlyMustInit" },
        { kind: "call-marker", exportName: "readwriteRef", marker: "byrefReadwrite" },
        { kind: "call-marker", exportName: "readonlyRef", marker: "byrefReadonly" },
        { kind: "call-marker", exportName: "borrowShared", marker: "borrowShared" },
        { kind: "call-marker", exportName: "borrowMutable", marker: "borrowMutable" },
        { kind: "call-marker", exportName: "move", marker: "move" },
        { kind: "call-marker", exportName: "valueType", marker: "valueType" },
        { kind: "call-marker", exportName: "field", marker: "field" },
        { kind: "call-marker", exportName: "attributes", marker: "attributes" },
        { kind: "call-marker", exportName: "defaultValue", marker: "defaultValue" },
        { kind: "type-marker", exportName: "pointer", marker: "pointer" },
        { kind: "type-marker", exportName: "functionPointer", marker: "functionPointer" },
      ],
    },
    {
      moduleSpecifier: csharpLangModule,
      packageName: "@tsonic/csharp",
      subpath: "lang.js",
      exports: [
        { kind: "call-marker", exportName: "out", marker: "byrefWriteonlyMustInit" },
        { kind: "call-marker", exportName: "ref", marker: "byrefReadwrite" },
        { kind: "call-marker", exportName: "inref", marker: "byrefReadonly" },
        { kind: "call-marker", exportName: "struct", marker: "valueType" },
        { kind: "call-marker", exportName: "attribute", marker: "attribute" },
        { kind: "call-marker", exportName: "defaultof", marker: "defaultValue" },
        { kind: "type-marker", exportName: "ptr", marker: "pointer" },
        { kind: "type-marker", exportName: "fnptr", marker: "functionPointer" },
      ],
    },
  ];
}

function createCsharpCoreVirtualModulesProvider(): TargetBindingProvider {
  const modules = new Map(csharpSourceSemanticsModules().map((module) => [module.moduleSpecifier, module]));
  const identity: ProviderIdentity = {
    id: "tsonic.csharp.core-virtual-modules",
    version: "0.0.1",
    target: "csharp",
    extensionContractVersion: TstsProviderContractVersion,
    providerKind: "binding",
    displayName: "Tsonic C# source modules",
  };
  return {
    identity,
    ownsModule(specifier: string, _context: ProviderModuleContext): ProviderOwnership {
      return modules.has(specifier) ? { kind: "owned" } : { kind: "unowned" };
    },
    resolveModule(specifier: string, _context: ProviderModuleContext): ProviderModuleResolution | ExtensionDiagnostic {
      const module = modules.get(specifier);
      if (module === undefined) {
        return {
          extensionId: identity.id,
          extensionCode: "CSHARP_CORE_MODULE_UNOWNED",
          numericCode: 9100001,
          category: "error",
          message: `C# core provider does not own '${specifier}'.`,
        };
      }
      return {
        kind: "virtual",
        moduleSpecifier: specifier,
        virtualFileName: `tsts-provider://tsonic-csharp/${encodeURIComponent(specifier)}`,
        providerModuleId: specifier,
        ...(module.packageName !== undefined ? { packageName: module.packageName } : {}),
        ...(module.packageVersion !== undefined ? { packageVersion: module.packageVersion } : {}),
        evidence: [{ message: "C# target supplies source module as provider virtual module." }],
      };
    },
    getDeclarationModel(resolution: ProviderModuleResolution): ProviderDeclarationModel | ExtensionDiagnostic {
      const module = modules.get(resolution.moduleSpecifier);
      if (module === undefined) {
        return {
          extensionId: identity.id,
          extensionCode: "CSHARP_CORE_MODULE_DECLARATION_MISSING",
          numericCode: 9100002,
          category: "error",
          message: `No C# core declaration model exists for '${resolution.moduleSpecifier}'.`,
        };
      }
      return {
        moduleSpecifier: resolution.moduleSpecifier,
        providerModuleId: resolution.providerModuleId,
        exports: module.exports.flatMap(toProviderExportDeclarations),
        evidence: [{ message: "Declaration model is generated from target source semantics." }],
      };
    },
    getTargetIdentity(symbol) {
      if (symbol.exportName === undefined) {
        return undefined;
      }
      const module = modules.get(symbol.moduleSpecifier);
      const declaration = module?.exports.find((candidate) => candidate.exportName === symbol.exportName);
      if (declaration === undefined) {
        return undefined;
      }
      if (declaration.kind === "source-primitive") {
        return {
          target: "csharp",
          id: getCsharpPrimitiveTargetIdentity(declaration.primitive),
          displayName: getCsharpPrimitiveDisplayName(declaration.primitive),
        };
      }
      return {
        target: "csharp",
        id: `${symbol.moduleSpecifier}#${symbol.exportName}`,
        displayName: symbol.exportName,
      };
    },
  };
}

function toProviderExportDeclarations(declaration: SourceSemanticsExportDeclaration): readonly ProviderExportDeclaration[] {
  switch (declaration.kind) {
    case "source-primitive":
      return [primitiveExportToProviderDeclaration(declaration)];
    case "call-marker":
      return callMarkerToProviderDeclarations(declaration);
    case "type-marker":
      return [typeMarkerToProviderDeclaration(declaration)];
  }
}

function primitiveExportToProviderDeclaration(declaration: SourcePrimitiveDeclaration): ProviderExportDeclaration {
  return {
    id: declaration.exportName,
    name: declaration.exportName,
    kind: "type",
    targetIdentity: {
      target: "csharp",
      id: getCsharpPrimitiveTargetIdentity(declaration.primitive),
      displayName: getCsharpPrimitiveDisplayName(declaration.primitive),
    },
    type: { kind: "source-primitive", name: declaration.primitive },
  };
}

function callMarkerToProviderDeclarations(declaration: SourceCallMarkerDeclaration): readonly ProviderExportDeclaration[] {
  if (declaration.marker === "attributes") {
    return attributeBuilderProviderDeclarations(declaration);
  }
  const typeParameter = { name: "T" };
  const typeParameterRef: ProviderTypeExpression = { kind: "type-parameter", name: "T" };
  const parameters = declaration.marker === "defaultValue"
    ? []
    : [{ name: "value", type: typeParameterRef, optional: !isRequiredStorageMarker(declaration.marker) }];
  return [{
    id: declaration.exportName,
    name: declaration.exportName,
    kind: "function",
    signatures: [{
      id: `${declaration.exportName}<T>`,
      typeParameters: [typeParameter],
      parameters,
      returnType: typeParameterRef,
    }],
  }];
}

function attributeBuilderProviderDeclarations(declaration: SourceCallMarkerDeclaration): readonly ProviderExportDeclaration[] {
  const typeParameter = { name: "T" };
  const targetType: ProviderTypeExpression = { kind: "type-parameter", name: "T" };
  const builder = attributeBuilderType("AttributeBuilder", targetType);
  return [
    {
      id: declaration.exportName,
      name: declaration.exportName,
      kind: "function",
      signatures: [{
        id: `${declaration.exportName}<T>`,
        typeParameters: [typeParameter],
        parameters: [],
        returnType: builder,
      }],
    },
    attributeSupportType(attributeTargetTypeName, attributeTargetShape()),
    attributeSupportType(attributeArgumentTypeName, attributeArgumentShape()),
    attributeBuilderInterface("AttributeBuilder", [
      attributeAddMember("AttributeBuilder", targetType),
      selectorMember("property", "AttributeMemberBuilder", targetType),
      selectorMember("method", "AttributeMethodBuilder", targetType),
    ]),
    attributeBuilderInterface("AttributeMemberBuilder", [
      attributeAddMember("AttributeMemberBuilder", targetType),
    ]),
    attributeBuilderInterface("AttributeMethodBuilder", [
      attributeAddMember("AttributeMethodBuilder", targetType),
      {
        id: "parameter(name)",
        name: "parameter",
        kind: "method",
        signatures: [{
          id: "parameter(name)",
          parameters: [{ name: "name", type: { kind: "string" } }],
          returnType: attributeBuilderType("AttributeParameterBuilder", targetType),
        }],
      },
    ]),
    attributeBuilderInterface("AttributeParameterBuilder", [
      attributeAddMember("AttributeParameterBuilder", targetType),
    ]),
  ];
}

function attributeSupportType(
  name: string,
  type: ProviderTypeExpression,
): ProviderExportDeclaration {
  return {
    id: name,
    name,
    kind: "type",
    type,
  };
}

function attributeBuilderInterface(
  name: string,
  members: readonly ProviderMemberDeclaration[],
): ProviderExportDeclaration {
  return {
    id: name,
    name,
    kind: "interface",
    typeParameters: [{ name: "T" }],
    members,
  };
}

function attributeAddMember(
  builderName: AttributeBuilderTypeName,
  targetType: ProviderTypeExpression,
): ProviderMemberDeclaration {
  return {
    id: "add(attribute,args)",
    name: "add",
    kind: "method",
    signatures: [{
      id: "add(attribute,args)",
      parameters: [
        { name: "attribute", type: { kind: "reference", name: attributeTargetTypeName } },
        { name: "args", type: { kind: "array", elementType: { kind: "reference", name: attributeArgumentTypeName } }, rest: true },
      ],
      returnType: attributeBuilderType(builderName, targetType),
    }],
  };
}

function selectorMember(
  name: "method" | "property",
  builderName: AttributeBuilderTypeName,
  targetType: ProviderTypeExpression,
): ProviderMemberDeclaration {
  return {
    id: `${name}(selector)`,
    name,
    kind: "method",
    signatures: [{
      id: `${name}(selector)`,
      typeParameters: [{ name: "TSelected" }],
      parameters: [{
        name: "selector",
        type: {
          kind: "function",
          parameters: [{ name: "target", type: targetType }],
          returnType: { kind: "type-parameter", name: "TSelected" },
        },
      }],
      returnType: attributeBuilderType(builderName, targetType),
    }],
  };
}

function attributeBuilderType(
  name: AttributeBuilderTypeName,
  targetType: ProviderTypeExpression,
): ProviderTypeExpression {
  return {
    kind: "reference",
    name,
    typeArguments: [targetType],
  };
}

function isRequiredStorageMarker(marker: SourceCallMarkerDeclaration["marker"]): boolean {
  return marker === "byrefReadonly" || marker === "byrefReadwrite" || marker === "byrefWriteonlyMustInit";
}

function typeMarkerToProviderDeclaration(declaration: SourceTypeMarkerDeclaration): ProviderExportDeclaration {
  return {
    id: declaration.exportName,
    name: declaration.exportName,
    kind: "type",
    typeParameters: [{ name: "T" }],
    type: sourceMarkerOpaqueType(declaration.marker),
  };
}

function attributeTargetShape(): ProviderTypeExpression {
  return {
    kind: "opaque",
    id: "tsonic.csharp.attribute.target",
    displayName: "C# attribute target",
    sourceShape: { kind: "object" },
  };
}

function attributeArgumentShape(): ProviderTypeExpression {
  return {
    kind: "union",
    types: [
      { kind: "string" },
      { kind: "number" },
      { kind: "boolean" },
      { kind: "bigint" },
      { kind: "literal", value: null },
      {
        kind: "opaque",
        id: "tsonic.csharp.attribute.argument",
        displayName: "C# provider-backed attribute argument",
        sourceShape: { kind: "object" },
      },
    ],
  };
}

function sourceMarkerOpaqueType(marker: SourceTypeMarkerDeclaration["marker"]): ProviderTypeExpression {
  return {
    kind: "opaque",
    id: `tsonic.csharp.marker.${marker}`,
    displayName: `C# ${marker} marker`,
    sourceShape: { kind: "object" },
  };
}

function getCsharpPrimitiveTargetIdentity(primitive: SourcePrimitiveKind): string {
  switch (primitive) {
    case "bool":
      return "System.Boolean";
    case "char16":
      return "System.Char";
    case "char32":
      return "System.Text.Rune";
    case "int8":
      return "System.SByte";
    case "uint8":
      return "System.Byte";
    case "int16":
      return "System.Int16";
    case "uint16":
      return "System.UInt16";
    case "int32":
      return "System.Int32";
    case "uint32":
      return "System.UInt32";
    case "int64":
      return "System.Int64";
    case "uint64":
      return "System.UInt64";
    case "native-int":
      return "System.IntPtr";
    case "native-uint":
      return "System.UIntPtr";
    case "float16":
      return "System.Half";
    case "float32":
      return "System.Single";
    case "float64":
      return "System.Double";
    case "decimal128":
      return "System.Decimal";
    case "int128":
      return "System.Int128";
    case "uint128":
      return "System.UInt128";
  }
}

function getCsharpPrimitiveDisplayName(primitive: SourcePrimitiveKind): string {
  switch (primitive) {
    case "bool":
      return "bool";
    case "char16":
      return "char";
    case "char32":
      return "System.Text.Rune";
    case "int8":
      return "sbyte";
    case "uint8":
      return "byte";
    case "int16":
      return "short";
    case "uint16":
      return "ushort";
    case "int32":
      return "int";
    case "uint32":
      return "uint";
    case "int64":
      return "long";
    case "uint64":
      return "ulong";
    case "native-int":
      return "nint";
    case "native-uint":
      return "nuint";
    case "float16":
      return "Half";
    case "float32":
      return "float";
    case "float64":
      return "double";
    case "decimal128":
      return "decimal";
    case "int128":
      return "Int128";
    case "uint128":
      return "UInt128";
  }
}
