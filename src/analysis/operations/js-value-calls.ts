import type { AstReader, Node } from "@tsonic/tsts";
import type { ResolvedSourceCallInfo } from "../../policy/operations/members/index.js";

export type CsharpJsValueCallShape =
  | { readonly kind: "direct"; readonly receiver?: undefined }
  | { readonly kind: "property" | "element"; readonly receiver: Node | undefined };

export function classifyCsharpJsValueCallShape(
  ast: AstReader,
  source: ResolvedSourceCallInfo | undefined,
): CsharpJsValueCallShape {
  const access = source?.sourceCalleeAccess;
  if (
    access?.kind === "property" &&
    ast.is.IsPropertyAccessExpression(access.expression)
  ) {
    return { kind: "property", receiver: access.receiver.expression };
  }
  if (
    access?.kind === "element" &&
    ast.is.IsElementAccessExpression(access.expression)
  ) {
    return { kind: "element", receiver: access.receiver.expression };
  }
  return { kind: "direct" };
}
