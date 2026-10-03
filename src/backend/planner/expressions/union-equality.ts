import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpResolvedBinaryOperation } from "../../../analysis/operations/index.js";
import type { CsharpExpression, CsharpSwitchExpressionArm } from "../../target-ast/roslyn/index.js";
import type { CsharpPlanningContext } from "../context.js";
import type { ExpressionPlanner } from "./expression-planner-types.js";
import type { DestructuringPlannerState } from "../bindings/binding-state.js";
import { allocateExpressionTemp } from "../bindings/binding-state.js";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { planCsharpUnionPattern } from "./union-patterns.js";
import { callStatic } from "./csharp-expression-builders.js";
import { csharpUnionEqualityArmsEqual } from "../../../target-model/operations/binary.js";
import type { CsharpUnionEqualityArm } from "../../../target-model/operations/binary.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { getCsharpNullableElementTargetType } from "../../../target-model/types/nullable.js";
import { isCsharpAbsenceTargetType } from "../../../target-model/types/runtime-carriers.js";
import { csharpSourcePrimitiveTargetType } from "../../../target-model/types/scalar-types.js";
import { planCsharpPresentValueGuard, planCsharpStorageIsAbsent } from "./optional-storage.js";
import type { CsharpPlannedValue } from "./planned-values.js";
import { composeCsharpPlannedValues, planCsharpExpressionCompletion } from "./planned-value-composition.js";

export function planCsharpUnionEquality(
  node: Node,
  selection: CsharpResolvedBinaryOperation,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  state: DestructuringPlannerState | undefined,
): CsharpPlannedValue | undefined {
  const operation = selection.targetOperation;
  const sealed = input.program.operations.binary(node)?.target;
  if (operation.kind !== "union-equality" || state === undefined ||
    sealed?.kind !== "resolved" || sealed.targetOperation.kind !== "union-equality" ||
    typeof operation.negated !== "boolean" || operation.negated !== sealed.targetOperation.negated ||
    selection.left !== sealed.left || selection.right !== sealed.right ||
    !targetTypeRefEquals(selection.leftType, sealed.leftType) || !targetTypeRefEquals(selection.rightType, sealed.rightType) ||
    !targetTypeRefEquals(selection.resultType, csharpSourcePrimitiveTargetType("bool")) ||
    !csharpUnionEqualityArmsEqual(sealed.targetOperation.arms, operation.arms) ||
    selection.sourceOperator !== sealed.sourceOperator ||
    selection.sourceOperator !== (operation.negated ? "!==" : "===")) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Union equality requires sealed native operations and a hygienic evaluation scope."));
    return undefined;
  }
  const left = planExpression(selection.left, sourceFile, input, diagnostics, state);
  const right = planExpression(selection.right, sourceFile, input, diagnostics, state);
  if (left === undefined || right === undefined) return undefined;
  const arms: CsharpSwitchExpressionArm[] = [];
  for (const arm of operation.arms) {
    const designation = allocateExpressionTemp(state);
    const receiver: CsharpExpression = { kind: "IdentifierName", name: designation };
    const left = planEqualityOperand(arm.left, selection.leftType,
      { kind: "SimpleMemberAccessExpression", receiver, name: "Item1" }, input, state);
    const right = planEqualityOperand(arm.right, selection.rightType,
      { kind: "SimpleMemberAccessExpression", receiver, name: "Item2" }, input, state);
    if (left === undefined || right === undefined) return undefined;
    const when = left.condition === undefined ? right.condition : right.condition === undefined ? left.condition
      : { kind: "BinaryExpression" as const, left: left.condition, right: right.condition,
          operatorToken: { kind: "AmpersandAmpersandToken" as const } };
    let comparison: CsharpExpression;
    if (arm.operation.kind === "reference-identity") {
      comparison = arm.operation.distinctMethodValues === true ? { kind: "LiteralExpression", value: false }
        : callStatic({ kind: "PredefinedType", name: "object" }, "ReferenceEquals", [left.value, right.value]);
    } else {
      const leftType = csharpTypeFromTargetTypeRef(arm.operation.leftInputType, input.scope.typeParameterNames);
      const rightType = csharpTypeFromTargetTypeRef(arm.operation.rightInputType, input.scope.typeParameterNames);
      if (leftType === undefined || rightType === undefined) return undefined;
      comparison = { kind: "BinaryExpression", operatorToken: { kind: "EqualsEqualsToken" },
        left: targetTypeRefEquals(arm.left.carrier, arm.operation.leftInputType) ? left.value
          : { kind: "CastExpression", type: leftType, expression: left.value },
        right: targetTypeRefEquals(arm.right.carrier, arm.operation.rightInputType) ? right.value
          : { kind: "CastExpression", type: rightType, expression: right.value } };
    }
    arms.push({ pattern: { kind: "VarPattern", designation }, when, expression: comparison });
  }
  arms.push({ pattern: { kind: "DiscardPattern" }, expression: { kind: "LiteralExpression", value: false } });
  return composeCsharpPlannedValues(node, sourceFile, input, diagnostics, [left, right], values => {
    const result: CsharpExpression = { kind: "SwitchExpression", expression: { kind: "TupleExpression", elements: values }, arms };
    return planCsharpExpressionCompletion(node, sourceFile, input, diagnostics,
      operation.negated ? { kind: "PrefixUnaryExpression", operatorToken: { kind: "ExclamationToken" }, operand: result } : result,
      selection.resultType);
  });
}

function planEqualityOperand(
  arm: CsharpUnionEqualityArm["left"],
  storage: TargetTypeRef,
  value: CsharpExpression,
  input: CsharpPlanningContext,
  state: DestructuringPlannerState,
): { readonly value: CsharpExpression; readonly condition?: CsharpExpression } | undefined {
  if (arm.path.length === 0 && isCsharpAbsenceTargetType(arm.carrier)) {
    const condition = planCsharpStorageIsAbsent(storage, value, input.scope.typeParameterNames);
    return condition === undefined ? undefined : { value: { kind: "LiteralExpression", value: null }, condition };
  }
  if (arm.path.length === 0 && getCsharpNullableElementTargetType(storage) !== undefined) {
    return planCsharpPresentValueGuard(storage, arm.carrier, value, allocateExpressionTemp(state), input.scope.typeParameterNames);
  }
  return planCsharpUnionPattern(value, arm.path, storage);
}
