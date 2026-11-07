import type { AstReader, Node } from "@tsonic/tsts";
import type { SourceCallSelection, SourceProgramFacts } from "@tsonic/target-api/source";

/**
 * The member access a call's callee is, through transparent wrappers (`(o.m)()`, `o.m!()`), read from the Host: the
 * access node (facts.navigation.expressions.transparentOperand), its published receiver (selections.memberAccess /
 * values.elementAccess) and, for a property, the selected name; for an element, its own index operand. The one reader
 * of the callee receiver and key (R2, R4): JS value calls, their emission and native operand order all read it.
 */
export type CsharpCalleeAccess =
  | { readonly kind: "property"; readonly access: Node; readonly receiver: Node; readonly name: string }
  | { readonly kind: "element"; readonly access: Node; readonly receiver: Node; readonly key: Node | undefined };

export function csharpCalleeAccess(
  ast: AstReader,
  facts: Pick<SourceProgramFacts, "navigation" | "selections" | "values">,
  source: SourceCallSelection,
): CsharpCalleeAccess | undefined {
  const access = facts.navigation.expressions.transparentOperand(source.callee);
  const property = facts.selections.memberAccess(access);
  if (property !== undefined) return Object.freeze({ kind: "property", access, receiver: property.receiver, name: property.name });
  if (!ast.is.IsElementAccessExpression(access)) return undefined;
  const element = facts.values.elementAccess(access);
  return Object.freeze({ kind: "element", access, receiver: element.receiver,
    key: ast.as.AsElementAccessExpression(access)?.ArgumentExpression });
}

export type CsharpJsValueCallShape =
  | { readonly kind: "direct"; readonly receiver?: undefined }
  | { readonly kind: "property" | "element"; readonly receiver: Node | undefined };

/** The callee form of a call: a property or element access callee names the call's receiver (csharpCalleeAccess). */
export function classifyCsharpJsValueCallShape(
  ast: AstReader,
  facts: Pick<SourceProgramFacts, "navigation" | "selections" | "values">,
  source: SourceCallSelection | undefined,
): CsharpJsValueCallShape {
  const access = source === undefined ? undefined : csharpCalleeAccess(ast, facts, source);
  return access === undefined ? { kind: "direct" } : { kind: access.kind, receiver: access.receiver };
}
