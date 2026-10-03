import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpSourceOperator } from "../../../../target-model/syntax/operators.js";
import type { TargetTypeRef } from "../../../../target-model/types/index.js";
import { targetTypeRefEquals } from "../../../../target-model/types/index.js";
import type { CsharpPlanningContext } from "../../context.js";
import { unsupportedNodeDiagnostic } from "../../diagnostics.js";
import type { ExpectedExpressionPlanner, ExpressionPlanner } from "../expression-planner-types.js";
import { planSelectedCsharpBinaryOperation } from "./selected-binary.js";
import type { DestructuringPlannerState } from "../../bindings/binding-state.js";
import type { CsharpPlannedValue } from "../planned-values.js";

export function tryPlanBinaryExpressionWithExpectedType(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  expectedTargetType: TargetTypeRef | undefined,
  planExpression: ExpressionPlanner,
  planExpressionWithExpectedType: ExpectedExpressionPlanner,
  state?: DestructuringPlannerState,
): CsharpPlannedValue | undefined {
  if (!input.program.source.ast.is.IsBinaryExpression(node)) return undefined;
  const baseline = input.program.operations.binary(node)?.target;
  if (expectedTargetType === undefined || baseline?.kind === "resolved" &&
    !binaryOperationUsesExpectedResultType(baseline.sourceOperator)) return undefined;
  const selection = input.program.expectedTypes.binaryExpected(node, expectedTargetType);
  if (selection === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node,
      "C# binary planning requires a sealed expected-target operation classification that analysis did not produce."));
    return undefined;
  }
  return selection.kind === "resolved" &&
    binaryOperationUsesExpectedResultType(selection.sourceOperator) &&
    targetTypeRefEquals(selection.resultType, expectedTargetType)
    ? planSelectedCsharpBinaryOperation(node, selection, sourceFile, input, diagnostics,
        planExpression, planExpressionWithExpectedType, state)
    : undefined;
}

function binaryOperationUsesExpectedResultType(operator: CsharpSourceOperator): boolean {
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
