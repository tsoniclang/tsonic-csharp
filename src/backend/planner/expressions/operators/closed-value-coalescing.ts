import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpResolvedBinaryOperation } from "../../../../target-model/records/operator-selection.js";
import type { CsharpPlanningContext } from "../../context.js";
import type { CsharpExpression } from "../../../target-ast/syntax/index.js";
import { allocateExpressionTemp, type DestructuringPlannerState } from "../../bindings/binding-state.js";
import { failCsharpPlannerInvariant } from "../../../invariants.js";
import { csharpTypeFromTargetTypeRef } from "../../types/target-types.js";
import type { ExpressionPlanner } from "../expression-planner-types.js";
import { planCsharpStorageIsAbsent } from "../optional-storage.js";
import { planCsharpAssignmentLocation } from "./assignment-location.js";
import { csharpPlannedValue, type CsharpPlannedValue } from "../planned-values.js";
import { planCsharpValueBranch } from "../planned-value-composition.js";
import { csharpSourcePrimitiveTargetType } from "../../../../target-model/types/carriers/scalar-types.js";

export function planCsharpClosedValueCoalescing(node: Node, selection: CsharpResolvedBinaryOperation, sourceFile: SourceFile, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[], planExpression: ExpressionPlanner, state: DestructuringPlannerState | undefined
): CsharpPlannedValue | undefined {
  const operation = selection.targetOperation;
  if (operation.kind !== "closed-value-coalesce") return undefined;
  const type = csharpTypeFromTargetTypeRef(selection.resultType, input.scope.typeParameterNames);
  if (state === undefined || type === undefined) {
    failCsharpPlannerInvariant("An admitted closed-value coalescing expression requires its native carrier and name scope.", node);
  }
  let storage = selection.left;
  while (input.program.source.ast.is.IsParenthesizedExpression(storage)) {
    const nested = input.program.source.ast.as.AsParenthesizedExpression(storage)?.Expression;
    if (nested === undefined) failCsharpPlannerInvariant("An admitted coalescing expression requires its exact storage operand.", storage);
    storage = nested;
  }
  const left = planExpression(storage, sourceFile, { ...input, storageExpression: storage }, diagnostics, state);
  const right = planExpression(selection.right, sourceFile, input, diagnostics, state);
  if (left === undefined || right === undefined) failCsharpPlannerInvariant("An admitted coalescing expression requires both native operands.", node);
  const build = (location: CsharpExpression): CsharpPlannedValue | undefined => {
    const name = allocateExpressionTemp(state);
    const current: CsharpExpression = { kind: "IdentifierName", name };
    const absent = planCsharpStorageIsAbsent(selection.leftType, current, input)
      ?? failCsharpPlannerInvariant("An admitted coalescing expression requires its native absence test.", node);
    const condition: CsharpExpression = { kind: "BinaryExpression", operatorToken: { kind: "AmpersandAmpersandToken" },
        left: { kind: "IsPatternExpression", expression: location, type: { kind: "IdentifierName", name: "var" }, designation: name },
        right: absent };
    const assigned = !operation.assignment || right.completion.kind !== "value" ? right
      : csharpPlannedValue(selection.resultType, { kind: "AssignmentExpression", left: location,
          operatorToken: { kind: "EqualsToken" }, right: right.completion.expression }, right.prelude);
    return planCsharpValueBranch(node, sourceFile, input, diagnostics,
      csharpPlannedValue(csharpSourcePrimitiveTargetType("bool"), condition), assigned,
      csharpPlannedValue(selection.resultType, current), selection.resultType);
  };
  return operation.assignment
    ? planCsharpAssignmentLocation(node, operation.location, left, diagnostics, state, build)
    : left.completion.kind === "never" ? left : left.completion.kind !== "value" ? undefined
      : appendLeftPrelude(left, build(left.completion.expression));
}

function appendLeftPrelude(left: CsharpPlannedValue, result: CsharpPlannedValue | undefined): CsharpPlannedValue | undefined {
  return result === undefined ? undefined : { prelude: [...left.prelude, ...result.prelude], completion: result.completion };
}
