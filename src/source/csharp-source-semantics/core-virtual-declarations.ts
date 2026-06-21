import type {
  ProviderExportDeclaration,
  SourceSemanticsModule,
} from "@tsonic/tsts";
import {
  csharpLangModule,
  neutralLangModule,
} from "./identity.js";
import {
  attributeBuilderDeclaration,
  attributeMemberBuilderDeclaration,
} from "./core-virtual-attribute-declarations.js";
import {
  providerCallMarkerDeclaration,
  providerPrimitiveDeclaration,
  providerTypeMarkerDeclaration,
} from "./core-virtual-marker-declarations.js";

export function providerExportDeclarationsForModule(module: SourceSemanticsModule): readonly ProviderExportDeclaration[] {
  return [
    ...sourceSemanticsHelperDeclarations(module.moduleSpecifier),
    ...module.exports.map(providerExportDeclarationForSourceSemantics),
  ];
}

export function emptySourceModule(moduleSpecifier: string): SourceSemanticsModule {
  return {
    moduleSpecifier,
    exports: [],
  };
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
      return providerPrimitiveDeclaration(declaration.exportName, declaration.primitive);
    case "type-marker":
      return providerTypeMarkerDeclaration(declaration.exportName, declaration.marker);
    case "call-marker":
      return providerCallMarkerDeclaration(declaration.exportName, declaration.marker);
  }
}
