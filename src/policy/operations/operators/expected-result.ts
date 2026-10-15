import type { CsharpSourceOperator } from "../../../target-model/syntax/operators.js";

export function csharpBinaryOperationUsesExpectedResultType(operator: CsharpSourceOperator): boolean {
  switch (operator) {
    case ",":
    case "&&":
    case "||":
    case "+":
    case "-":
    case "*":
    case "/":
    case "%":
    case "**":
    case "&":
    case "|":
    case "^":
    case "<<":
    case ">>":
    case ">>>":
      return true;
    default:
      return false;
  }
}
