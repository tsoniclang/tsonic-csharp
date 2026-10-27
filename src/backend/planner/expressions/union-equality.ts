import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpResolvedBinaryOperation } from "../../../target-model/records/operations/operator-selection.js";
import type { CsharpUnionEqualityOperand } from "../../../target-model/records/operations/union-equality.js";
import type { CsharpExpression, CsharpSwitchExpressionArm } from "../../target-ast/syntax/index.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpPlanningContext } from "../context.js";
import type { ExpressionPlanner } from "./expression-planner-types.js";
import { allocateExpressionTemp, type DestructuringPlannerState } from "../bindings/binding-state.js";
import { csharpTypeFromTargetTypeRef } from "../types/render.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";
import { planCsharpUnionPattern } from "./union-patterns.js";
import { callStatic } from "./builders.js";
import { planCsharpPresentValueGuard, planCsharpStorageIsAbsent } from "./optional-storage.js";
import type { CsharpPlannedValue } from "./planned-values.js";
import { composeCsharpPlannedValues, planCsharpExpressionCompletion } from "./planned-value-composition.js";

export function planCsharpUnionEquality(node: Node, _selection: CsharpResolvedBinaryOperation, sourceFile: SourceFile,
  input: CsharpPlanningContext, diagnostics: TargetDiagnostic[], planExpression: ExpressionPlanner,
  state: DestructuringPlannerState | undefined): CsharpPlannedValue | undefined {
  const selected = input.program.records.unionEquality.get(node);
  if (selected === undefined || state === undefined)
    failCsharpPlannerInvariant("An admitted union equality requires its native plan and hygienic evaluation scope.", node);
  const left = planExpression(selected.left, sourceFile, input, diagnostics, state)
    ?? failCsharpPlannerInvariant("An admitted union equality requires its left operand.", selected.left);
  const right = planExpression(selected.right, sourceFile, input, diagnostics, state)
    ?? failCsharpPlannerInvariant("An admitted union equality requires its right operand.", selected.right);
  const arms: CsharpSwitchExpressionArm[] = [];
  for (const arm of selected.arms) {
    const designation = allocateExpressionTemp(state);
    const receiver: CsharpExpression = { kind: "IdentifierName", name: designation };
    const left = planEqualityOperand(arm.left, selected.leftType, { kind: "SimpleMemberAccessExpression", receiver, name: "Item1" }, input, state);
    const right = planEqualityOperand(arm.right, selected.rightType, { kind: "SimpleMemberAccessExpression", receiver, name: "Item2" }, input, state);
    const when = left.condition === undefined ? right.condition : right.condition === undefined ? left.condition
      : { kind: "BinaryExpression" as const, left: left.condition, right: right.condition, operatorToken: { kind: "AmpersandAmpersandToken" as const } };
    let comparison: CsharpExpression;
    if (arm.operation.kind === "reference-identity") comparison = arm.operation.distinctMethodValues === true ? { kind: "LiteralExpression", value: false }
      : callStatic({ kind: "PredefinedType", name: "object" }, "ReferenceEquals", [left.value, right.value]);
    else {
      const cast = (value: CsharpExpression, carrier: TargetTypeRef): CsharpExpression => ({ kind: "CastExpression", expression: value,
        type: csharpTypeFromTargetTypeRef(carrier, input.scope.typeParameterNames)
          ?? failCsharpPlannerInvariant("An admitted union equality requires its native operator input type.", node) });
      comparison = { kind: "BinaryExpression", operatorToken: { kind: "EqualsEqualsToken" },
        left: arm.castLeft ? cast(left.value, arm.operation.leftInputType) : left.value,
        right: arm.castRight ? cast(right.value, arm.operation.rightInputType) : right.value };
    }
    arms.push({ pattern: { kind: "VarPattern", designation }, when, expression: comparison });
  }
  arms.push({ pattern: { kind: "DiscardPattern" }, expression: { kind: "LiteralExpression", value: false } });
  return composeCsharpPlannedValues(node, sourceFile, input, diagnostics, [left, right], values => {
    const result: CsharpExpression = { kind: "SwitchExpression", expression: { kind: "TupleExpression", elements: values }, arms };
    return planCsharpExpressionCompletion(node, sourceFile, input, diagnostics,
      selected.negated ? { kind: "PrefixUnaryExpression", operatorToken: { kind: "ExclamationToken" }, operand: result } : result, selected.result);
  });
}

function planEqualityOperand(side: CsharpUnionEqualityOperand, storage: TargetTypeRef, value: CsharpExpression,
  input: CsharpPlanningContext, state: DestructuringPlannerState): { readonly value: CsharpExpression; readonly condition?: CsharpExpression } {
  if (side.form === "absence") return { value: { kind: "LiteralExpression", value: null },
    condition: planCsharpStorageIsAbsent(storage, value, input)
      ?? failCsharpPlannerInvariant("An admitted union equality requires its native absence test.") };
  if (side.form === "present") return planCsharpPresentValueGuard(storage, side.arm.carrier, value, allocateExpressionTemp(state), input);
  return planCsharpUnionPattern(value, side.arm.path, storage, false, input);
}
