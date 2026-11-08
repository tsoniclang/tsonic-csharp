import type { Node } from "@tsonic/tsts";
import type { SourceLiteralUnit, SourcePresence, TargetSourceProgram } from "@tsonic/target-api/source";
import type { CsharpRepresentationOutcome } from "../../target-model/types/representation.js";
import type { CsharpNativeLiteralQueries } from "../../policy/model/native-literals.js";

export function createCsharpNativeLiteralQueries(source: TargetSourceProgram): CsharpNativeLiteralQueries {
  const occurrences = new Set(source.facts.values.occurrences());
  const none = Object.freeze({ kind: "represented" as const, value: Object.freeze({ kind: "none" as const }) });
  const scalar: CsharpNativeLiteralQueries["scalar"] = occurrence => {
    if (!occurrences.has(occurrence)) return none;
    const selected = source.facts.values.type(occurrence);
    return selected.kind === "refused" ? Object.freeze({ kind: "source-refused", refusal: selected })
      : Object.freeze({ kind: "represented", value: source.facts.descriptors.scalarLiteral(selected.value) });
  };
  const hasRecipeSyntax: CsharpNativeLiteralQueries["hasRecipeSyntax"] = occurrence => {
    let expression = occurrence;
    while (source.ast.is.IsParenthesizedExpression(expression)) {
      const operand = source.ast.as.AsParenthesizedExpression(expression)?.Expression;
      if (operand === undefined) throw new TypeError("An original Native literal syntax requires its parenthesized operand.");
      expression = operand;
    }
    if (source.ast.is.IsPrefixUnaryExpression(expression)) {
      const operand = source.ast.as.AsPrefixUnaryExpression(expression)?.Operand;
      return operand !== undefined && hasRecipeSyntax(operand);
    }
    const kind = source.ast.kindName(expression);
    return source.ast.is.IsNumericLiteral(expression) || source.ast.is.IsBigIntLiteral(expression) ||
      source.ast.is.IsStringLiteral(expression) || kind === "KindTrueKeyword" || kind === "KindFalseKeyword" ||
      kind === "KindNullKeyword" || kind === "KindNoSubstitutionTemplateLiteral";
  };
  const recipe: CsharpNativeLiteralQueries["recipe"] = occurrence => {
    let expression = occurrence;
    while (source.ast.is.IsParenthesizedExpression(expression)) {
      const operand = source.ast.as.AsParenthesizedExpression(expression)?.Expression;
      if (operand === undefined) throw new TypeError("An original parenthesized Native literal requires its operand.");
      expression = operand;
    }
    if (source.ast.is.IsPrefixUnaryExpression(expression)) {
      const operation = source.facts.values.operation(expression);
      if (operation.kind === "refused") return Object.freeze({ kind: "source-refused", refusal: operation });
      if (operation.value.kind !== "unary" || operation.value.operator !== "negate" && operation.value.operator !== "positive" ||
        operation.value.operands.length !== 1) return none;
      let operand = operation.value.operands[0]!.occurrence;
      while (source.ast.is.IsParenthesizedExpression(operand)) {
        const inner = source.ast.as.AsParenthesizedExpression(operand)?.Expression;
        if (inner === undefined) throw new TypeError("An original unary Native literal requires its operand.");
        operand = inner;
      }
      return source.ast.is.IsNumericLiteral(operand) || source.ast.is.IsBigIntLiteral(operand)
        ? Object.freeze({ kind: "represented", value: source.facts.descriptors.scalarLiteral(operation.value.result) }) : none;
    }
    const kind = source.ast.kindName(expression);
    return source.ast.is.IsNumericLiteral(expression) || source.ast.is.IsBigIntLiteral(expression) ||
      source.ast.is.IsStringLiteral(expression) || kind === "KindTrueKeyword" || kind === "KindFalseKeyword" ||
      kind === "KindNullKeyword" || kind === "KindNoSubstitutionTemplateLiteral" ? scalar(occurrence) : none;
  };
  return Object.freeze({ scalar, recipe, hasRecipeSyntax });
}
