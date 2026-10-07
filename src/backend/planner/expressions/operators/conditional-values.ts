import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpResolvedBinaryOperation } from "../../../../analysis/operations/index.js";
import type { CsharpPlanningContext } from "../../context.js";
import type { DestructuringPlannerState } from "../../bindings/binding-state.js";
import type { ExpectedExpressionPlanner, ExpressionPlanner } from "../expression-planner-types.js";
import { csharpTypeFromTargetTypeRef } from "../../types/target-types.js";
import { csharpPlannedValue, type CsharpPlannedValue } from "../planned-values.js";
import { planCsharpValueBranch } from "../planned-value-composition.js";
import { planCsharpPlannedDiscard } from "../../statements/statement-output.js";
import { applyCsharpConversionSelection, readCsharpExpressionConversionClassification } from "../conversions.js";
import { targetTypeRefEquals } from "../../../../target-model/types/equality.js";
import { csharpSourcePrimitiveTargetType } from "../../../../target-model/types/scalar-types.js";

export function planCsharpConditionalValue(
  node: Node,
  selection: CsharpResolvedBinaryOperation,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  planExpressionWithExpectedType: ExpectedExpressionPlanner,
  state?: DestructuringPlannerState,
): CsharpPlannedValue | undefined {
  const operation = selection.targetOperation;
  if (operation.kind !== "conditional-value") return undefined;
  const type = csharpTypeFromTargetTypeRef(selection.resultType, input.scope.typeParameterNames);
  if (type === undefined) return undefined;
  if (operation.branch === "left") return planExpressionWithExpectedType(
    selection.left, sourceFile, input, diagnostics, type, undefined, selection.resultType, state);
  const left = planExpression(selection.left, sourceFile, input, diagnostics, state);
  if (left === undefined || left.completion.kind === "never") return left;
  const right = planExpressionWithExpectedType(
    selection.right, sourceFile, input, diagnostics, type, undefined, selection.resultType, state);
  if (right === undefined) return undefined;
  if (operation.branch === "right") return {
    prelude: [...planCsharpPlannedDiscard(left), ...right.prelude], completion: right.completion,
  };
  const boolean = csharpSourcePrimitiveTargetType("bool");
  if (left.completion.kind === "value" && right.completion.kind === "value" && right.prelude.length === 0 &&
    targetTypeRefEquals(left.completion.carrier, boolean) && targetTypeRefEquals(right.completion.carrier, boolean) &&
    targetTypeRefEquals(selection.resultType, boolean)) {
    return csharpPlannedValue(boolean, { kind: "BinaryExpression", left: left.completion.expression,
      operatorToken: { kind: operation.operator === "&&" ? "AmpersandAmpersandToken" : "BarBarToken" },
      right: right.completion.expression }, left.prelude);
  }
  const conversion = readCsharpExpressionConversionClassification(selection.left, input, diagnostics,
    selection.leftType, selection.resultType, "implicit");
  const expression = conversion === undefined ? undefined : applyCsharpConversionSelection(
    selection.left, sourceFile, input, diagnostics, selection.leftType, selection.resultType, conversion,
    { kind: "LiteralExpression", value: operation.operator === "||" });
  if (expression === undefined) return undefined;
  const empty = csharpPlannedValue(selection.resultType, expression);
  return planCsharpValueBranch(node, sourceFile, input, diagnostics, left,
    operation.operator === "&&" ? right : empty, operation.operator === "&&" ? empty : right, selection.resultType);
}
