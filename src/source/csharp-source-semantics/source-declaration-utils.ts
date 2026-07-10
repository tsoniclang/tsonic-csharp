import type {
  ExtensionObservationContext,
  Node,
} from "@tsonic/tsts";
import {
  isDeclarationOrVirtualSourceFile,
} from "./ast-utils.js";

export function isAmbientOrExternalDeclaration(
  declaration: Node | undefined,
  context: Pick<ExtensionObservationContext, "compiler">,
): declaration is Node {
  const compiler = context.compiler;
  if (declaration === undefined || compiler === undefined) {
    return false;
  }
  const sourceFile = compiler.ast.getSourceFile(declaration);
  return isDeclarationOrVirtualSourceFile(sourceFile, compiler.ast) ||
    compiler.ast.hasModifierKind(declaration, "ambient");
}
