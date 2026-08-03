import {
  providerCallMarkerDeclaration,
  providerPrimitiveDeclaration,
  providerTypeMarkerDeclaration,
} from "@tsonic/source-core";
import type {
  ProviderExportDeclaration,
  SourceSemanticsModule,
} from "@tsonic/tsts";
export function providerExportDeclarationsForCsharpSourceModule(module: SourceSemanticsModule): readonly ProviderExportDeclaration[] {
  return module.exports.map(providerExportDeclarationForCsharpSourceSemantics);
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
