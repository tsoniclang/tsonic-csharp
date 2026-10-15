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
} from "../../target-model/identities/source.js";
import { csharpSourceSemanticsModules } from "./source-modules.js";
import {
  csharpNativePointerExport,
  csharpSafetyProviderNames,
} from "../extension/explicit-safety.js";
import { csharpRankedArrayDescriptors } from "./ranked-arrays.js";

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
        ...csharpRankedArrayProviderDeclarations(),
        unsafeContextProviderDeclaration(csharpSafetyProviderNames),
        ...safetyProviderDeclarations(csharpSafetyProviderNames),
      ];
}

function csharpRankedArrayProviderDeclarations(): ProviderDeclarationModel["exports"] {
  return csharpRankedArrayDescriptors.map((descriptor) => {
    const typeParameter = { kind: "type-parameter" as const, name: "T" };
    const int32Type = { kind: "source-primitive" as const, name: "int32" as const };
    const indexParameters = descriptor.indexParameterNames.map((name) => ({
      name,
      type: int32Type,
    }));
    return {
      id: descriptor.exportName,
      name: descriptor.exportName,
      kind: "interface" as const,
      typeParameters: [{ name: "T" }],
      members: [
        {
          id: descriptor.markerMemberId,
          name: "__tsonicRankedArray",
          kind: "property" as const,
          readonly: true,
          type: {
            kind: "function" as const,
            id: descriptor.markerMemberId,
            parameters: [{ name: "value", type: typeParameter }],
            returnType: { kind: "literal" as const, value: descriptor.rank },
          },
        },
        {
          id: descriptor.getMemberId,
          name: "get",
          kind: "method" as const,
          signatures: [{
            id: descriptor.getSignatureId,
            parameters: indexParameters,
            returnType: typeParameter,
          }],
        },
        {
          id: descriptor.setMemberId,
          name: "set",
          kind: "method" as const,
          signatures: [{
            id: descriptor.setSignatureId,
            parameters: [
              ...indexParameters,
              { name: "value", type: typeParameter },
            ],
            returnType: { kind: "void" as const },
          }],
        },
      ],
    };
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
