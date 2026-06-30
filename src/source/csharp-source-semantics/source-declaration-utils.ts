import type {
  ExtensionObservationContext,
  Node,
} from "@tsonic/tsts";
import {
  isDeclarationOrVirtualSourceFile,
} from "./ast-utils.js";

const nodeFlagsAmbient = 8388608;

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
    hasAmbientNodeFlag(declaration);
}

function hasAmbientNodeFlag(node: Node): boolean {
  const flags = (node as { readonly Flags?: unknown }).Flags;
  return typeof flags === "number" && (flags & nodeFlagsAmbient) !== 0;
}
