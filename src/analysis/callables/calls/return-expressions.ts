import type { AstReader, Node } from "@tsonic/tsts";
import { isSourceCallableBodyBoundary, type SourceProgramFacts } from "@tsonic/target-api/source";
import { csharpLiteralIsRepresentableAs } from "../../../policy/conversions/literals.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { getCsharpNullableElementTargetType } from "../../../target-model/types/carriers/nullable.js";

/** Visits the expressions a callable returns directly: an expression body, or each `return` operand of its own body. */
export function forEachCsharpDirectReturnExpression(ast: AstReader, declaration: Node, consume: (expression: Node) => void): void {
  const body = ast.body(declaration);
  if (body === undefined) return;
  if (ast.is.IsArrowFunction(declaration) && !ast.is.IsBlock(body)) {
    consume(body);
    return;
  }
  visit(body);

  function visit(node: Node): void {
    if (node !== body && isSourceCallableBodyBoundary(ast, node)) return;
    if (ast.is.IsReturnStatement(node)) {
      const expression = ast.as.AsReturnStatement(node)?.Expression;
      if (expression !== undefined) consume(expression);
      return;
    }
    ast.forEachChild(node, (child) => {
      if (child !== undefined) visit(child);
    });
  }
}

/**
 * A callable whose every direct return is a literal exactly representable in `target` can return `target` itself:
 * `() => 9n` under a `() => int64` context returns the long literal 9 instead of a BigInteger.
 */
export function csharpLiteralReturnsFit(ast: AstReader, declaration: Node, target: TargetTypeRef,
  facts: SourceProgramFacts): boolean {
  let returns = 0;
  let fits = true;
  forEachCsharpDirectReturnExpression(ast, declaration, (expression) => {
    returns++;
    const nullable = getCsharpNullableElementTargetType(target) !== undefined;
    const outcome = facts.values.type(expression);
    const absence = nullable && (ast.kindName(expression) === "KindNullKeyword" ||
      outcome.kind !== "refused" && outcome.type.kind === "intrinsic" && outcome.type.intrinsic === "absence");
    fits &&= absence || csharpLiteralIsRepresentableAs(facts.values.literal(expression), target);
  });
  return returns > 0 && fits;
}
