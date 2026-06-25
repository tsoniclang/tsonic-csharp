import type {
  Node,
} from "@tsonic/tsts";
import {
  asNodeSubject,
  getNodeField,
} from "../../../ast-utils.js";
import {
  getBinaryOperatorText,
} from "../../../operator-syntax.js";
import type {
  CsharpArrayLifecycleAst,
} from "./types.js";

export function parentIsWriteTarget(
  node: Node,
  ast: CsharpArrayLifecycleAst,
): boolean {
  const parent = ast.parent(node);
  if (parent === undefined) {
    return false;
  }
  if (ast.is.IsBinaryExpression(parent) && asNodeSubject(getNodeField(parent, "Left")) === node) {
    return isAssignmentOperator(getBinaryOperatorText(ast, parent));
  }
  return (ast.is.IsPrefixUnaryExpression(parent) || ast.is.IsPostfixUnaryExpression(parent)) &&
    asNodeSubject(getNodeField(parent, "Operand")) === node;
}

export function isDeleteExpressionOperand(
  node: Node,
  ast: CsharpArrayLifecycleAst,
): boolean {
  const parent = ast.parent(node);
  return parent !== undefined &&
    ast.kindName(parent) === "KindDeleteExpression" &&
    asNodeSubject(getNodeField(parent, "Expression")) === node;
}

function isAssignmentOperator(operator: string | undefined): boolean {
  switch (operator) {
    case "=":
    case "+=":
    case "-=":
    case "*=":
    case "/=":
    case "%=":
    case "&=":
    case "|=":
    case "^=":
    case "<<=":
    case ">>=":
    case ">>>=":
    case "&&=":
    case "||=":
    case "??=":
      return true;
    default:
      return false;
  }
}
