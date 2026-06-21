import {
  TstsProviderContractVersion,
} from "@tsonic/tsts";
import type {
  ExtensionDiagnostic,
  ProviderDeclarationModel,
  ProviderExportDeclaration,
  ProviderIdentity,
  ProviderModuleContext,
  ProviderModuleResolution,
  ProviderOwnership,
  ProviderParameterDeclaration,
  ProviderTypeExpression,
  SourceCallMarkerDeclaration,
  SourcePrimitiveKind,
  SourceSemanticsModule,
  SourceTypeMarkerDeclaration,
  TargetBindingProvider,
} from "@tsonic/tsts";
import { csharpProviderDiagnostic } from "./diagnostics.js";
import {
  csharpLangModule,
  csharpProviderVersion,
  csharpTargetId,
  neutralLangModule,
} from "./identity.js";
import { csharpSourceSemanticsModules } from "./source-modules.js";

export function createCsharpCoreVirtualModulesProvider(): TargetBindingProvider {
  const modules = new Map(csharpSourceSemanticsModules().map((module) => [module.moduleSpecifier, module]));
  const identity: ProviderIdentity = {
    id: "tsonic.csharp.core-virtual-modules",
    version: csharpProviderVersion,
    target: csharpTargetId,
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
        return csharpProviderDiagnostic(identity.id, "CSHARP_CORE_MODULE_UNOWNED", 9100001, `C# core provider does not own '${specifier}'.`);
      }
      return {
        kind: "virtual",
        moduleSpecifier: specifier,
        virtualFileName: `tsts-provider://csharp-source/${specifier}`,
        providerModuleId: specifier,
        ...(module.packageName !== undefined ? { packageName: module.packageName } : {}),
        ...(module.packageVersion !== undefined ? { packageVersion: module.packageVersion } : {}),
        evidence: [{ message: "C# target supplies source module as provider virtual module." }],
      };
    },
    getDeclarationModel(resolution: ProviderModuleResolution): ProviderDeclarationModel | ExtensionDiagnostic {
      const module = modules.get(resolution.moduleSpecifier);
      if (module === undefined) {
        return csharpProviderDiagnostic(identity.id, "CSHARP_CORE_MODULE_DECLARATION_MISSING", 9100002, `No C# core declaration model exists for '${resolution.moduleSpecifier}'.`);
      }
      return {
        moduleSpecifier: resolution.moduleSpecifier,
        providerModuleId: resolution.providerModuleId,
        exports: providerExportDeclarationsForModule(module),
        evidence: [{ message: "Declaration model is generated from C# target source semantics." }],
      };
    },
    getTargetIdentity(symbol) {
      if (symbol.exportName === undefined) {
        return undefined;
      }
      const declaration = providerExportDeclarationsForModule(modules.get(symbol.moduleSpecifier) ?? emptySourceModule(symbol.moduleSpecifier))
        .find((candidate) => candidate.name === symbol.exportName);
      return declaration?.targetIdentity ?? {
        target: csharpTargetId,
        id: `${symbol.moduleSpecifier}#${symbol.exportName}`,
        displayName: symbol.exportName,
      };
    },
  };
}

function providerExportDeclarationsForModule(module: SourceSemanticsModule): readonly ProviderExportDeclaration[] {
  return [
    ...sourceSemanticsHelperDeclarations(module.moduleSpecifier),
    ...module.exports.map(providerExportDeclarationForSourceSemantics),
  ];
}

function sourceSemanticsHelperDeclarations(moduleSpecifier: string): readonly ProviderExportDeclaration[] {
  if (moduleSpecifier !== neutralLangModule && moduleSpecifier !== csharpLangModule) {
    return [];
  }
  return [
    attributeBuilderDeclaration(),
    attributeMemberBuilderDeclaration(),
  ];
}

function providerExportDeclarationForSourceSemantics(declaration: SourceSemanticsModule["exports"][number]): ProviderExportDeclaration {
  switch (declaration.kind) {
    case "source-primitive":
      return {
        id: declaration.exportName,
        name: declaration.exportName,
        kind: "type",
        type: providerTypeForPrimitive(declaration.primitive),
        targetIdentity: {
          target: csharpTargetId,
          id: `tsonic.source.${declaration.primitive}`,
          displayName: declaration.exportName,
        },
      };
    case "type-marker":
      return providerTypeMarkerDeclaration(declaration.exportName, declaration.marker);
    case "call-marker":
      return providerCallMarkerDeclaration(declaration.exportName, declaration.marker);
  }
}

function providerTypeMarkerDeclaration(exportName: string, marker: SourceTypeMarkerDeclaration["marker"]): ProviderExportDeclaration {
  const typeParameters = marker === "ptr"
    ? [{ name: "T" }]
    : [{ name: "TArgs" }, { name: "TReturn" }];
  return {
    id: exportName,
    name: exportName,
    kind: "type",
    typeParameters,
    type: { kind: "unknown" },
  };
}

function providerCallMarkerDeclaration(exportName: string, marker: SourceCallMarkerDeclaration["marker"]): ProviderExportDeclaration {
  const typeParameter = { kind: "type-parameter" as const, name: "T" };
  switch (marker) {
    case "out":
    case "ref":
    case "inref":
    case "borrow":
    case "borrowMut":
    case "move":
    case "struct":
      return {
        id: exportName,
        name: exportName,
        kind: "function",
        signatures: [{
          id: `${exportName}(value)`,
          typeParameters: [{ name: "T" }],
          parameters: [{ name: "value", type: typeParameter }],
          returnType: typeParameter,
        }],
      };
    case "field":
    case "defaultof":
      return {
        id: exportName,
        name: exportName,
        kind: "function",
        signatures: [{
          id: `${exportName}<T>()`,
          typeParameters: [{ name: "T" }],
          parameters: [],
          returnType: typeParameter,
        }],
      };
    case "attribute":
      return {
        id: exportName,
        name: exportName,
        kind: "function",
        signatures: [{
          id: `${exportName}<T>(...args)`,
          typeParameters: [{ name: "T" }],
          parameters: [],
          returnType: {
            kind: "provider-ref",
            name: "__TsonicAttributeBuilder",
            typeArguments: [typeParameter],
          },
        }],
      };
  }
}

function attributeBuilderDeclaration(): ProviderExportDeclaration {
  const ownerType: ProviderTypeExpression = { kind: "type-parameter", name: "TOwner" };
  const memberBuilder: ProviderTypeExpression = {
    kind: "provider-ref",
    name: "__TsonicAttributeMemberBuilder",
    typeArguments: [ownerType],
  };
  return {
    id: "__TsonicAttributeBuilder",
    name: "__TsonicAttributeBuilder",
    kind: "interface",
    typeParameters: [{ name: "TOwner" }],
    members: [
      methodMember("__TsonicAttributeBuilder.add", "add", [
        { name: "attribute", type: { kind: "object" } },
        { name: "args", type: { kind: "any" }, rest: true },
      ], { kind: "void" }),
      methodMember("__TsonicAttributeBuilder.property", "property", [{
        name: "selector",
        type: {
          kind: "function",
          parameters: [{ name: "target", type: ownerType }],
          returnType: { kind: "any" },
        },
      }], memberBuilder),
      methodMember("__TsonicAttributeBuilder.method", "method", [{
        name: "selector",
        type: {
          kind: "function",
          parameters: [{ name: "target", type: ownerType }],
          returnType: { kind: "any" },
        },
      }], memberBuilder),
    ],
  };
}

function attributeMemberBuilderDeclaration(): ProviderExportDeclaration {
  const ownerType: ProviderTypeExpression = { kind: "type-parameter", name: "TOwner" };
  const self: ProviderTypeExpression = {
    kind: "provider-ref",
    name: "__TsonicAttributeMemberBuilder",
    typeArguments: [ownerType],
  };
  return {
    id: "__TsonicAttributeMemberBuilder",
    name: "__TsonicAttributeMemberBuilder",
    kind: "interface",
    typeParameters: [{ name: "TOwner" }],
    members: [
      methodMember("__TsonicAttributeMemberBuilder.add", "add", [
        { name: "attribute", type: { kind: "object" } },
        { name: "args", type: { kind: "any" }, rest: true },
      ], { kind: "void" }),
      methodMember("__TsonicAttributeMemberBuilder.parameter", "parameter", [
        { name: "name", type: { kind: "string" } },
      ], self),
    ],
  };
}

function methodMember(
  id: string,
  sourceName: string,
  parameters: readonly ProviderParameterDeclaration[],
  returnType: ProviderTypeExpression,
  typeParameters: readonly { readonly name: string }[] = [],
) {
  return {
    id,
    name: sourceName,
    kind: "method" as const,
    signatures: [{
      id,
      name: targetMemberNameFromId(id),
      parameters,
      returnType,
      ...(typeParameters.length === 0 ? {} : { typeParameters }),
    }],
  };
}

function targetMemberNameFromId(id: string): string {
  const paren = id.indexOf("(");
  const qualifiedName = paren === -1 ? id : id.slice(0, paren);
  const lastDot = qualifiedName.lastIndexOf(".");
  return qualifiedName.slice(lastDot + 1);
}

function providerTypeForPrimitive(kind: SourcePrimitiveKind): ProviderTypeExpression {
  return { kind: "source-primitive", name: kind };
}

function emptySourceModule(moduleSpecifier: string): SourceSemanticsModule {
  return {
    moduleSpecifier,
    exports: [],
  };
}
