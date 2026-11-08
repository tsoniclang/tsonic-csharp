import type { AstReader, Node } from "@tsonic/tsts";
import type { SourceProgramFacts } from "@tsonic/target-api/source";
import type { CsharpNativeLiteralQueries } from "../../../policy/model/native-literals.js";
import type { CsharpRepresentationOutcome } from "../../../target-model/types/representation.js";
import { csharpScalarLiteralIsRepresentableAs } from "../../../policy/conversions/literals.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { getCsharpNullableElementTargetType } from "../../../target-model/types/carriers/nullable.js";

/** Visits the expressions a callable returns directly: an expression body, or each `return` operand of its own body. */
export function forEachCsharpDirectReturnExpression(ast: AstReader, navigation: SourceProgramFacts["navigation"], declaration: Node, consume: (expression: Node) => void): void {
  const body = ast.body(declaration);
  if (body === undefined) return;
  if (ast.is.IsArrowFunction(declaration) && !ast.is.IsBlock(body)) {
    consume(body);
    return;
  }
  visit(body);

  function visit(node: Node): void {
    if (ast.is.IsReturnStatement(node)) {
      if (navigation.enclosing(node, "body") !== declaration) return;
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
export function csharpLiteralReturnsFit(ast: AstReader, navigation: SourceProgramFacts["navigation"], literals: CsharpNativeLiteralQueries,
  declaration: Node, target: TargetTypeRef): CsharpRepresentationOutcome<boolean> {
  let returns = 0;
  let fits = true;
  let failure: Exclude<CsharpRepresentationOutcome<never>, { readonly kind: "represented" }> | undefined;
  forEachCsharpDirectReturnExpression(ast, navigation, declaration, (expression) => {
    returns++;
    const literal = literals.recipe(expression);
    if (literal.kind !== "represented") { failure = literal; return; }
    fits &&= literal.value.kind === "present" && csharpScalarLiteralIsRepresentableAs(literal.value.value, target);
  });
  return failure ?? Object.freeze({ kind: "represented", value: returns > 0 && fits });
}
