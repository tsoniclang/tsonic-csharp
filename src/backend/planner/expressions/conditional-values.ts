import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpResolvedBinaryOperation } from "../../../target-model/records/operations/operator-selection.js";
import type { CsharpPlanningContext } from "../context.js";
import type { DestructuringPlannerState } from "../bindings/binding-state.js";
import type { ExpressionPlanner } from "./expression-planner-types.js";
import { csharpPlannedValue, mapCsharpPlannedValue, type CsharpPlannedValue } from "./planned-values.js";
import { planCsharpValueBranch } from "./planned-value-composition.js";
import { planCsharpPlannedDiscard } from "../statements/statement-output.js";
import { applyCsharpConversionSelection, readCsharpExpressionOperandStability, readCsharpExpressionConversionClassification } from "./conversions.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";
import { csharpSourcePrimitiveTargetType } from "../../../target-model/types/carriers/scalar-types.js";

export function planCsharpConditionalValue(node: Node, selection: CsharpResolvedBinaryOperation, sourceFile: SourceFile, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[], planExpression: ExpressionPlanner, state?: DestructuringPlannerState
): CsharpPlannedValue | undefined {
  const operation = selection.targetOperation;
  if (operation.kind !== "conditional-value") return undefined;
  const emission = input.program.records.nativeBinaryEmission.get(node, selection)
    ?? failCsharpPlannerInvariant("An admitted conditional value requires its exact native branch emission record.", node);
  const left = planExpression(selection.left, sourceFile, input, diagnostics, state);
  if (left === undefined || left.completion.kind === "never") return left;
  if (operation.branch === "left") {
    const conversion = readCsharpExpressionConversionClassification(selection.left, input, diagnostics,
      selection.leftType, selection.resultType, "implicit");
    return conversion === undefined ? undefined : mapCsharpPlannedValue(left, selection.resultType, (value, prelude) =>
      applyCsharpConversionSelection(selection.left, sourceFile, input, diagnostics,
        selection.leftType, selection.resultType, conversion, value, prelude, readCsharpExpressionOperandStability(selection.left, input, selection.leftType, selection.resultType, "implicit", conversion)));
  }
  const right = planExpression(selection.right, sourceFile, input, diagnostics, state);
  if (right === undefined) return undefined;
  if (operation.branch === "right") return {
    ...right, prelude: [...planCsharpPlannedDiscard(left), ...right.prelude],
  };
  const boolean = csharpSourcePrimitiveTargetType("bool");
  if (left.completion.kind === "value" && right.completion.kind === "value" && right.prelude.length === 0 &&
    emission.nativeBoolean) {
    return csharpPlannedValue(boolean, { kind: "BinaryExpression", left: left.completion.expression,
      operatorToken: { kind: operation.operator === "&&" ? "AmpersandAmpersandToken" : "BarBarToken" },
      right: right.completion.expression }, left.prelude);
  }
  const conversion = readCsharpExpressionConversionClassification(selection.left, input, diagnostics,
    selection.leftType, selection.resultType, "implicit");
  const prelude: import("../../target-ast/syntax/index.js").CsharpStatement[] = [];
  const expression = conversion === undefined ? undefined : applyCsharpConversionSelection(
    selection.left, sourceFile, input, diagnostics, selection.leftType, selection.resultType, conversion,
    { kind: "LiteralExpression", value: operation.operator === "||" }, prelude, "stable");
  if (expression === undefined) return undefined;
  const empty = csharpPlannedValue(selection.resultType, expression, prelude, emission.nativeBoolean);
  return planCsharpValueBranch(node, sourceFile, input, diagnostics, left,
    operation.operator === "&&" ? right : empty, operation.operator === "&&" ? empty : right, selection.resultType);
}
