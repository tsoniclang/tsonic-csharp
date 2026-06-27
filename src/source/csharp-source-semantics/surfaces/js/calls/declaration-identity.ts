import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  Node,
} from "@tsonic/tsts";
import {
  asNodeSubject,
  getNodeField,
} from "../../../ast-utils.js";

export function getSignatureDeclaration(signature: ExtensionFactSubject | undefined): Node | undefined {
  return asNodeSubject((signature as { readonly declaration?: unknown } | undefined)?.declaration);
}

export function getNodeParent(node: Node | undefined): Node | undefined {
  return asNodeSubject((node as { readonly Parent?: unknown } | undefined)?.Parent);
}

export function getPropertyAccessName(
  node: Node,
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
): string | undefined {
  if (!ast.is.IsPropertyAccessExpression(node)) {
    return undefined;
  }
  const name = asNodeSubject(getNodeField(node, "name"));
  const text = name === undefined ? "" : ast.text(name);
  return text.length === 0 ? undefined : text;
}
