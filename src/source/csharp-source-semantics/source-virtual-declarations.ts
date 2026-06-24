import {
  attributeBuilderDeclaration,
  attributeMemberBuilderDeclaration,
  providerCallMarkerDeclaration,
  providerPrimitiveDeclaration,
  providerTypeMarkerDeclaration,
} from "@tsonic/source-core";
import type {
  ProviderExportDeclaration,
  SourceSemanticsModule,
} from "@tsonic/tsts";
import {
  csharpLangModule,
} from "./identity.js";

export function providerExportDeclarationsForCsharpSourceModule(module: SourceSemanticsModule): readonly ProviderExportDeclaration[] {
  return [
    ...csharpSourceHelperDeclarations(module.moduleSpecifier),
    ...module.exports.map(providerExportDeclarationForCsharpSourceSemantics),
  ];
}

function csharpSourceHelperDeclarations(moduleSpecifier: string): readonly ProviderExportDeclaration[] {
  return moduleSpecifier === csharpLangModule
    ? [
        attributeBuilderDeclaration(),
        attributeMemberBuilderDeclaration(),
      ]
    : [];
}

function providerExportDeclarationForCsharpSourceSemantics(declaration: SourceSemanticsModule["exports"][number]): ProviderExportDeclaration {
  switch (declaration.kind) {
    case "source-primitive":
      return providerPrimitiveDeclaration(declaration.exportName, declaration.primitive);
    case "type-marker":
      return providerTypeMarkerDeclaration(declaration.exportName, declaration.marker);
    case "call-marker":
      return providerCallMarkerDeclaration(declaration.exportName, declaration.marker);
  }
}
