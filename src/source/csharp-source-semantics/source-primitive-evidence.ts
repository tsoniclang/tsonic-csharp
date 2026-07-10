import {
  providerVirtualDeclarationFactKey,
  sourcePrimitiveFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionObservationContext,
  Node,
} from "@tsonic/tsts";
import {
  csharpSourcePrimitiveKindForProviderVirtualDeclaration,
} from "./source-modules.js";

export function typeSyntaxContainsSourcePrimitiveEvidence(
  node: Node,
  context: ExtensionObservationContext,
): boolean {
  const ast = context.compiler?.ast;
  if (ast === undefined) {
    return false;
  }
  let found = false;
  const visit = (current: Node | undefined): void => {
    if (current === undefined || found) {
      return;
    }
    if (
      context.factResolver.resolve(current, sourcePrimitiveFactKey) !== undefined ||
      csharpSourcePrimitiveKindForProviderVirtualDeclaration(context.factResolver.resolve(current, providerVirtualDeclarationFactKey)) !== undefined
    ) {
      found = true;
      return;
    }
    ast.forEachChild(current, (child): void => {
      visit(child);
    });
  };
  visit(node);
  return found;
}
