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
import { csharpSourcePrimitiveTargetType } from "../../../target-model/types/scalar-types.js";

export function planCsharpUnionEquality(
  node: Node,
  selection: CsharpResolvedBinaryOperation,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  state: DestructuringPlannerState | undefined,
): CsharpExpression | undefined {
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
    const left = planCsharpUnionPattern({ kind: "SimpleMemberAccessExpression", receiver, name: "Item1" }, arm.left.path);
    const right = planCsharpUnionPattern({ kind: "SimpleMemberAccessExpression", receiver, name: "Item2" }, arm.right.path);
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
  const result: CsharpExpression = { kind: "SwitchExpression", expression: { kind: "TupleExpression", elements: [left, right] }, arms };
  return operation.negated ? { kind: "PrefixUnaryExpression", operatorToken: { kind: "ExclamationToken" }, operand: result } : result;
}
