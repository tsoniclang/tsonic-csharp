import type { Node } from "@tsonic/tsts";
import type { CsharpPolicyContext } from "../../model/context.js";
import type { CsharpJsArrayMutationSelection } from "../../../target-model/records/js-array-mutations.js";
import type { CsharpBinaryClassification, CsharpOperatorForm, CsharpOperatorFormClassification, CsharpPropertyClassification, CsharpUnaryClassification } from "../../../target-model/records/operations.js";
import { isCsharpAssignmentOperator, sourceOperatorFromKindName, type CsharpSourceOperator } from "../../../target-model/syntax/operators.js";
import { csharpDestructuringAssignmentSyntax } from "../../../source/extension/operators.js";
import { csharpBinaryOperationUsesExpectedResultType } from "./expected-result.js";
import { targetBinaryOperator } from "./rules.js";

export function selectCsharpOperatorForm(
  input: CsharpPolicyContext,
  node: Node,
  mutation: CsharpJsArrayMutationSelection | undefined,
  binary: CsharpBinaryClassification | undefined,
  unary: CsharpUnaryClassification | undefined,
  property: (subject: Node) => CsharpPropertyClassification | undefined,
): CsharpOperatorFormClassification {
  const { ast } = input;
  const operator = sourceOperatorFromKindName(ast.operatorKindName(node));
  const form = selectOperatorForm(ast, node, operator, mutation, binary, unary, property);
  return Object.freeze(ast.is.IsBinaryExpression(node) && operator !== undefined
    ? { form, usesExpectedResultType: csharpBinaryOperationUsesExpectedResultType(operator) }
    : { form });
}

function selectOperatorForm(
  ast: CsharpPolicyContext["ast"],
  node: Node,
  operator: CsharpSourceOperator | undefined,
  mutation: CsharpJsArrayMutationSelection | undefined,
  binary: CsharpBinaryClassification | undefined,
  unary: CsharpUnaryClassification | undefined,
  property: (subject: Node) => CsharpPropertyClassification | undefined,
): CsharpOperatorForm {
  if (!ast.is.IsBinaryExpression(node)) {
    if (mutation === undefined || mutation.kind !== "not-js-array-mutation") return "js-array-mutation";
    const operand = ast.is.IsPrefixUnaryExpression(node)
      ? ast.as.AsPrefixUnaryExpression(node)?.Operand
      : ast.as.AsPostfixUnaryExpression(node)?.Operand;
    if ((operator === "++" || operator === "--") && operand !== undefined && ast.is.IsPropertyAccessExpression(operand)) {
      const operandProperty = property(operand);
      const shapeProperty = operandProperty?.sourceOwned?.jsValueProperty;
      if (operandProperty?.selection.kind === "source-owned" &&
        (shapeProperty === undefined || shapeProperty.kind !== "not-js-value-object-shape")) return "js-value-object-shape-update";
    }
    return operator !== undefined && (unary === undefined || unary.jsValue.kind !== "not-js-value")
      ? "js-value-operation" : "selected";
  }
  if (csharpDestructuringAssignmentSyntax(ast, node) !== undefined) return "destructuring-assignment";
  if (mutation === undefined || mutation.kind !== "not-js-array-mutation") return "js-array-mutation";
  if (operator === "instanceof") return "type-test";
  const expression = ast.as.AsBinaryExpression(node);
  const left = expression?.Left;
  const operands = left !== undefined && expression?.Right !== undefined;
  if (operands && operator !== undefined && operator !== "=" && (binary === undefined || binary.jsValue.kind !== "not-js-value")) {
    return "js-value-operation";
  }
  if ((operator === "===" || operator === "==" || operator === "!==" || operator === "!=") &&
    binary?.typeofComparison !== undefined) return "typeof-comparison";
  if (left === undefined || !operands || operator === undefined || !isCsharpAssignmentOperator(operator) ||
    targetBinaryOperator(operator) === undefined) return "selected";
  if (ast.is.IsPropertyAccessExpression(left)) {
    const leftProperty = property(left);
    if (leftProperty === undefined) return "selected";
    const shapeProperty = leftProperty.sourceOwned?.jsValueProperty;
    if (leftProperty.selection.kind === "source-owned" && ast.as.AsPropertyAccessExpression(left)?.Expression !== undefined &&
      (shapeProperty === undefined || shapeProperty.kind !== "not-js-value-object-shape")) return "js-value-write";
    if (operator !== "=") return "selected";
    return binary?.propertyWrite === undefined || binary.propertyWrite.kind !== "not-js-value" ? "js-value-write" : "selected";
  }
  if (ast.is.IsElementAccessExpression(left)) {
    return binary?.elementWrite === undefined || binary.elementWrite.kind !== "not-js-value" ? "js-value-write" : "selected";
  }
  return "selected";
}
