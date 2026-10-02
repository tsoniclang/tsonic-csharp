import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpResolvedBinaryOperation } from "../../../../analysis/operations/index.js";
import type { CsharpPlanningContext } from "../../context.js";
import type { CsharpExpression } from "../../../target-ast/roslyn/index.js";
import { allocateExpressionTemp, type DestructuringPlannerState } from "../../bindings/binding-state.js";
import { unsupportedNodeDiagnostic } from "../../diagnostics.js";
import { csharpTypeFromTargetTypeRef } from "../../types/target-types.js";
import type { ExpectedExpressionPlanner, ExpressionPlanner } from "../expression-planner-types.js";
import { member } from "../csharp-expression-builders.js";
import { planCsharpAssignmentLocation } from "./assignment-location.js";

export function planCsharpClosedValueCoalescing(
  node: Node,
  selection: CsharpResolvedBinaryOperation,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  planExpressionWithExpectedType: ExpectedExpressionPlanner,
  state: DestructuringPlannerState | undefined,
): CsharpExpression | undefined {
  const operation = selection.targetOperation;
  if (operation.kind !== "closed-value-coalesce") return undefined;
  const type = csharpTypeFromTargetTypeRef(selection.resultType, input.scope.typeParameterNames);
  if (state === undefined || type === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Native closed-value coalescing requires its sealed carrier and hygienic evaluation scope."));
    return undefined;
  }
  let storage = selection.left;
  while (input.program.source.ast.is.IsParenthesizedExpression(storage)) {
    const nested = input.program.source.ast.as.AsParenthesizedExpression(storage)?.Expression;
    if (nested === undefined) return undefined;
    storage = nested;
  }
  const left = planExpression(storage, sourceFile, { ...input, storageExpression: storage }, diagnostics, state);
  const right = planExpressionWithExpectedType(selection.right, sourceFile, input, diagnostics,
    type, undefined, selection.rightInputType, state);
  if (left === undefined || right === undefined) return undefined;
  const build = (location: CsharpExpression): CsharpExpression => {
    const name = allocateExpressionTemp(state);
    const current: CsharpExpression = { kind: "IdentifierName", name };
    return {
      kind: "ConditionalExpression",
      condition: { kind: "BinaryExpression", operatorToken: { kind: "AmpersandAmpersandToken" },
        left: { kind: "IsPatternExpression", expression: location, type: { kind: "IdentifierName", name: "var" }, designation: name },
        right: { kind: "InvocationExpression", callee: member(current, "isUndefined"), arguments: [] } },
      whenTrue: operation.assignment
        ? { kind: "AssignmentExpression", left: location, operatorToken: { kind: "EqualsToken" }, right }
        : right,
      whenFalse: current,
    };
  };
  return operation.assignment
    ? planCsharpAssignmentLocation(node, operation.location, left, type, diagnostics, state, build)
    : build(left);
}
