import type {
  ProviderImportDeclaration,
  SourceDeclarationProvider,
} from "@tsonic/tsts";
import {
  createSourceSemanticsVirtualModuleProvider,
  tsonicCoreLangModule,
} from "@tsonic/source-core";
import {
  csharpLangModule,
  csharpProviderVersion,
} from "./identity.js";
import { csharpSourceSemanticsModules } from "./source-modules.js";

export function createCsharpSourceVirtualModulesProvider(): SourceDeclarationProvider {
  return createSourceSemanticsVirtualModuleProvider({
    id: "tsonic.csharp.source-virtual-modules",
    version: csharpProviderVersion,
    displayName: "Tsonic C# source alias modules",
    virtualDirectory: "csharp-source",
    modules: csharpSourceSemanticsModules(),
    importsForModule(module) {
      return module.moduleSpecifier === csharpLangModule
        ? csharpLangProviderImports()
        : [];
    },
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
