export type CsharpSourceOperator =
  | "==="
  | "=="
  | "!=="
  | "!="
  | "<"
  | "<="
  | ">"
  | ">="
  | "&&"
  | "||"
  | "??"
  | "&"
  | "|"
  | "^"
  | "<<"
  | ">>"
  | ">>>"
  | "+"
  | "-"
  | "*"
  | "**"
  | "/"
  | "%"
  | "="
  | "+="
  | "-="
  | "*="
  | "**="
  | "/="
  | "%="
  | "&&="
  | "&="
  | "||="
  | "|="
  | "??="
  | "^="
  | "<<="
  | ">>="
  | ">>>="
  | "!"
  | "~"
  | "++"
  | "--"
  | ","
  | "in"
  | "instanceof";

export type CsharpAssignmentOperator = Extract<
  CsharpSourceOperator,
  | "="
  | "+="
  | "-="
  | "*="
  | "**="
  | "/="
  | "%="
  | "&&="
  | "&="
  | "||="
  | "|="
  | "??="
  | "^="
  | "<<="
  | ">>="
  | ">>>="
>;

export function isCsharpAssignmentOperator(
  operator: CsharpSourceOperator,
): operator is CsharpAssignmentOperator {
  switch (operator) {
    case "=":
    case "+=":
    case "-=":
    case "*=":
    case "**=":
    case "/=":
    case "%=":
    case "&&=":
    case "&=":
    case "||=":
    case "|=":
    case "??=":
    case "^=":
    case "<<=":
    case ">>=":
    case ">>>=":
      return true;
    default:
      return false;
  }
}

import type { SourceOperation, SourcePrimitiveOperator } from "@tsonic/target-api/source";

export const csharpSourcePrimitiveOperators: Readonly<Record<SourcePrimitiveOperator, CsharpSourceOperator>> = Object.freeze({
  add: "+", subtract: "-", multiply: "*", divide: "/", remainder: "%", power: "**",
  "bit-and": "&", "bit-or": "|", "bit-xor": "^", "shift-left": "<<", "shift-right": ">>", "shift-right-unsigned": ">>>",
  negate: "-", positive: "+", "bit-not": "~", "logical-not": "!",
  less: "<", "less-equal": "<=", greater: ">", "greater-equal": ">=", equal: "==", "not-equal": "!=",
  "equal-strict": "===", "not-equal-strict": "!==",
});

export function csharpSourceOperationOperator(operation: SourceOperation): CsharpSourceOperator | undefined {
  switch (operation.kind) {
    case "unary": case "binary": return csharpSourcePrimitiveOperators[operation.operator];
    case "assignment": return "=";
    case "compound": return compoundSourceOperators[operation.operator];
    case "update": return operation.operator === "increment" ? "++" : "--";
    case "sequence": return ",";
    case "and": return "&&";
    case "or": return "||";
    case "coalesce": return "??";
    case "in": case "instanceof": return operation.kind;
    case "conditional": case "await": return undefined;
  }
}

const compoundSourceOperators: Readonly<Partial<Record<SourcePrimitiveOperator, CsharpAssignmentOperator>>> = Object.freeze({
  add: "+=", subtract: "-=", multiply: "*=", divide: "/=", remainder: "%=", power: "**=",
  "bit-and": "&=", "bit-or": "|=", "bit-xor": "^=", "shift-left": "<<=", "shift-right": ">>=", "shift-right-unsigned": ">>>=",
});

import type { AstReader, Node } from "@tsonic/tsts";

export function isCsharpDestructuringAssignmentPattern(
  ast: AstReader,
  node: Node | undefined,
): node is Node {
  return node !== undefined &&
    (
      ast.is.IsArrayLiteralExpression(node) ||
      ast.is.IsObjectLiteralExpression(node)
    );
}
