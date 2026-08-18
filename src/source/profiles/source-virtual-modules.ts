import type {
  ProviderDeclarationModel,
  ProviderImportDeclaration,
  SourceDeclarationProvider,
} from "@tsonic/tsts";
import {
  createSourceSemanticsVirtualModuleProvider,
  nativePointerProviderDeclaration,
  providerExportDeclarationsForSemanticsModule,
  safetyProviderDeclarations,
  unsafeContextProviderDeclaration,
} from "@tsonic/source-core/extension";
import { tsonicCoreLangModule } from "@tsonic/source-core/facts";
import {
  csharpLangModule,
  csharpProviderVersion,
  csharpSourceVirtualModulesProviderId,
} from "../extension/identity.js";
import { csharpSourceSemanticsModules } from "./source-modules.js";
import {
  csharpNativePointerExport,
  csharpSafetyProviderNames,
} from "../extension/explicit-safety.js";

export function createCsharpSourceVirtualModulesProvider(): SourceDeclarationProvider {
  return createSourceSemanticsVirtualModuleProvider({
    id: csharpSourceVirtualModulesProviderId,
    version: csharpProviderVersion,
    displayName: "Tsonic C# source alias modules",
    virtualDirectory: "csharp-source",
    modules: csharpSourceSemanticsModules(),
    importsForModule(module) {
      return module.moduleSpecifier === csharpLangModule
        ? csharpLangProviderImports()
        : [];
    },
    exportsForModule: csharpProviderExportsForModule,
    evidenceMessage:
      "C# target supplies source alias semantics as a complete virtual module.",
    diagnostics: {
      unowned: {
        extensionCode: "CSHARP_SOURCE_MODULE_UNOWNED",
        numericCode: 9100001,
      },
      declarationMissing: {
        extensionCode: "CSHARP_SOURCE_MODULE_DECLARATION_MISSING",
        numericCode: 9100002,
      },
    },
  });
}

export function csharpProviderExportsForModule(
  module: ReturnType<typeof csharpSourceSemanticsModules>[number],
): ProviderDeclarationModel["exports"] {
  const semantics = providerExportDeclarationsForSemanticsModule(module);
  return module.moduleSpecifier !== csharpLangModule
    ? semantics
    : [
        ...semantics,
        nativePointerProviderDeclaration(
          csharpNativePointerExport,
        ),
        unsafeContextProviderDeclaration(csharpSafetyProviderNames),
        ...safetyProviderDeclarations(csharpSafetyProviderNames),
      ];
}

function csharpLangProviderImports(): readonly ProviderImportDeclaration[] {
  return [{
    moduleSpecifier: tsonicCoreLangModule,
    typeOnly: true,
    namedImports: [
      {
        exportedName: "__TsonicAttributeBuilder",
        kind: "type",
      },
      {
        exportedName: "__TsonicAttributeMemberBuilder",
        kind: "type",
      },
    ],
  }];
}
