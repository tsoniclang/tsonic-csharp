import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpResolvedBinaryOperation } from "../../../../analysis/operations/index.js";
import type { CsharpPlanningContext } from "../../context.js";
import type { CsharpExpression } from "../../../target-ast/roslyn/index.js";
import type { ExpressionPlanner } from "../expression-planner-types.js";
import type { DestructuringPlannerState } from "../../bindings/binding-state.js";
import { callStatic } from "../csharp-expression-builders.js";
import { planCsharpAssignmentLocation } from "./assignment-location.js";
import { csharpPlannedValue, type CsharpPlannedValue } from "../planned-values.js";
import { buildCsharpPlannedValue } from "../planned-value-composition.js";

export function planCsharpBigIntCall(
  node: Node,
  selection: CsharpResolvedBinaryOperation,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  state: DestructuringPlannerState | undefined,
): CsharpPlannedValue | undefined {
  const operation = selection.targetOperation;
  if (operation.kind !== "bigint-call") return undefined;
  let storage = selection.left;
  while (input.program.source.ast.is.IsParenthesizedExpression(storage)) {
    const nested = input.program.source.ast.as.AsParenthesizedExpression(storage)?.Expression;
    if (nested === undefined) return undefined;
    storage = nested;
  }
  const left = planExpression(storage, sourceFile, operation.assignment ? { ...input, storageExpression: storage } : input, diagnostics);
  const right = planExpression(selection.right, sourceFile, input, diagnostics);
  if (left === undefined || right === undefined) return undefined;
  const calculate = (values: readonly CsharpExpression[]): CsharpExpression => callStatic(
    { kind: "IdentifierName", requiredUsingNamespace: "Tsonic.CSharp.Runtime", name: "BigIntOperators" }, operation.method, values);
  if (!operation.assignment) return buildCsharpPlannedValue(node, sourceFile, input, diagnostics,
    [left, right], calculate, selection.resultType);
  return planCsharpAssignmentLocation(node, operation.location, left, diagnostics, state, location =>
    buildCsharpPlannedValue(node, sourceFile, input, diagnostics,
      [csharpPlannedValue(selection.leftType, location), right], values => ({
        kind: "AssignmentExpression", left: location, operatorToken: { kind: "EqualsToken" }, right: calculate(values),
      }), selection.resultType));
}
