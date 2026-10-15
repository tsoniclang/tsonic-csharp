import type { AstReader, Node, SourceFile } from "@tsonic/tsts";
import { sourceIntegerConstantValue, sourceIntegerLiteralValue } from "@tsonic/target-api/source";
import type {
  CsharpSourceLiteralForm,
  CsharpSourceLiteralIndex,
  CsharpSourceLiteralValue,
} from "../../target-model/records/source-literals.js";
import { parseFiniteNumberLiteral } from "../../target-model/syntax/literal-values.js";

export function analyzeCsharpSourceLiteralValues(
  ast: AstReader,
  sourceFiles: readonly SourceFile[],
): CsharpSourceLiteralIndex {
  const values = new WeakMap<Node, CsharpSourceLiteralValue>();
  const visit = (node: Node): void => {
    ast.forEachChild(node, (child) => {
      if (child !== undefined) visit(child);
    });
    const value = extract(node);
    if (value !== undefined) values.set(node, value);
  };
  for (const sourceFile of sourceFiles) visit(sourceFile);
  return Object.freeze({ literalValue: Object.freeze({ get: (node: Node) => values.get(node) }) });

  function extract(node: Node): CsharpSourceLiteralValue | undefined {
    if (ast.is.IsStringLiteral(node)) return literal("string", { text: ast.text(node) });
    if (ast.is.IsNoSubstitutionTemplateLiteral(node)) return literal("template", { text: ast.text(node) });
    const kind = ast.kindName(node);
    if (kind === "KindTrueKeyword") return literal("true", {});
    if (kind === "KindFalseKeyword") return literal("false", {});
    if (ast.is.IsNumericLiteral(node)) {
      return literal("numeric", { number: parseFiniteNumberLiteral(ast.text(node)), integer: sourceIntegerLiteralValue(ast, node) });
    }
    if (ast.is.IsBigIntLiteral(node)) return literal("bigint", { integer: sourceIntegerLiteralValue(ast, node) });
    if (ast.is.IsPrefixUnaryExpression(node)) {
      const operator = ast.operatorKindName(node);
      const operand = ast.as.AsPrefixUnaryExpression(node)?.Operand;
      const signed = operand !== undefined && (operator === "KindPlusToken" || operator === "KindMinusToken")
        ? values.get(operand) : undefined;
      const negative = operator === "KindMinusToken";
      return literal("prefix-unary", {
        number: signed?.number === undefined ? undefined : negative ? -signed.number : signed.number,
        integer: signed?.integer === undefined ? undefined : negative ? -signed.integer : signed.integer,
      });
    }
    if (ast.is.IsParenthesizedExpression(node)) {
      const inner = ast.as.AsParenthesizedExpression(node)?.Expression;
      const enclosed = inner === undefined ? undefined : values.get(inner);
      const integerConstant = sourceIntegerConstantValue(ast, node);
      return enclosed?.number === undefined && enclosed?.integer === undefined && integerConstant === undefined ? undefined
        : literal("parenthesized", { number: enclosed?.number, integer: enclosed?.integer, integerConstant });
    }
    if (ast.is.IsBinaryExpression(node)) {
      const integerConstant = sourceIntegerConstantValue(ast, node);
      return integerConstant === undefined ? undefined : literal("binary", { integerConstant });
    }
    if (ast.is.IsArrayLiteralExpression(node)) {
      return literal("array", { elements: Object.freeze(ast.elements(node).map((element) =>
        element === undefined ? undefined : values.get(element))) });
    }
    return undefined;
  }
}

function literal(
  form: CsharpSourceLiteralForm,
  fields: {
    readonly number?: number | undefined;
    readonly integer?: bigint | undefined;
    readonly integerConstant?: bigint | undefined;
    readonly text?: string;
    readonly elements?: readonly (CsharpSourceLiteralValue | undefined)[];
  },
): CsharpSourceLiteralValue {
  return Object.freeze({
    form,
    ...(fields.number === undefined ? {} : { number: fields.number }),
    ...(fields.integer === undefined ? {} : { integer: fields.integer }),
    ...(fields.integerConstant === undefined ? {} : { integerConstant: fields.integerConstant }),
    ...(fields.text === undefined ? {} : { text: fields.text }),
    ...(fields.elements === undefined ? {} : { elements: fields.elements }),
  });
}
