import type { AstReader, Node } from "@tsonic/tsts";
import type { SourceCallSelection } from "@tsonic/target-api/source";

export type CsharpJsValueCallShape =
  | { readonly kind: "direct"; readonly receiver?: undefined }
  | { readonly kind: "property" | "element"; readonly receiver: Node | undefined };

/** The authored callee form of a call (syntax only): a property or element access names the call's receiver. */
export function classifyCsharpJsValueCallShape(
  ast: AstReader,
  source: SourceCallSelection | undefined,
): CsharpJsValueCallShape {
  const callee = source?.callee;
  if (callee !== undefined && ast.is.IsPropertyAccessExpression(callee)) {
    return { kind: "property", receiver: ast.as.AsPropertyAccessExpression(callee)?.Expression };
  }
  if (callee !== undefined && ast.is.IsElementAccessExpression(callee)) {
    return { kind: "element", receiver: ast.as.AsElementAccessExpression(callee)?.Expression };
  }
  return { kind: "direct" };
}
