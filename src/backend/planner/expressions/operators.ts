import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpPlanningContext } from "../context.js";
import type { DestructuringPlannerState } from "../bindings/binding-state.js";
import type { CsharpPlannedValue } from "./planned-values.js";
import type { CallArgumentPlanner, ExpressionPlanner } from "./expression-planner-types.js";
import { buildCsharpPlannedValue } from "./planned-value-composition.js";
import { planCsharpJsValueLogical } from "./js-value-logical.js";
import { tryPlanJsArrayMutationExpression } from "./expression-js-array-mutations.js";
import { planSelectedCsharpBinaryOperation } from "./selected-binary.js";
import { tryPlanTypeofComparisonExpression, tryPlanTypeTestExpression } from "./expression-typeof-operators.js";
import { translateCsharpJsValueInvocation } from "./js-value-operations.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";

export { planTypeofExpression } from "./expression-typeof-operators.js";

export function tryPlanBinaryExpression(node: Node, sourceFile: SourceFile, input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[], planExpression: ExpressionPlanner, planCallArgument: CallArgumentPlanner,
  state?: DestructuringPlannerState): CsharpPlannedValue | undefined {
  if (!input.program.source.ast.is.IsBinaryExpression(node)) return undefined;
  const selected = input.program.records.binaryEmission.get(node)
    ?? failCsharpPlannerInvariant("An admitted binary expression requires its selected native emission form.", node);
  switch (selected.kind) {
    case "js-array-mutation": return tryPlanJsArrayMutationExpression(node, sourceFile, input, diagnostics, planExpression, planCallArgument, state);
    case "type-test": return tryPlanTypeTestExpression(node, sourceFile, input, diagnostics, planExpression, state);
    case "typeof-comparison": return tryPlanTypeofComparisonExpression(node, sourceFile, input, diagnostics, planExpression, state);
    case "native": return planSelectedCsharpBinaryOperation(node, selected.selection, sourceFile, input, diagnostics, planExpression, state);
    case "js-value": {
      const left = planExpression(selected.left, sourceFile, input, diagnostics);
      const right = planExpression(selected.right, sourceFile, input, diagnostics);
      if (left === undefined || right === undefined) return undefined;
      if (selected.invocation.shortCircuit !== undefined) return planCsharpJsValueLogical(node, sourceFile, input, diagnostics,
        selected.invocation, selected.left, selected.right, left, right);
      return buildCsharpPlannedValue(node, sourceFile, input, diagnostics, [left, right], values =>
        translateCsharpJsValueInvocation(input.scope.typeParameterNames, selected.invocation, undefined, values), selected.invocation.resultType);
    }
    case "property-write": return buildCsharpPlannedValue(node, sourceFile, input, diagnostics, [
      planExpression(selected.receiver, sourceFile, input, diagnostics), planExpression(selected.value, sourceFile, input, diagnostics),
    ], values => translateCsharpJsValueInvocation(input.scope.typeParameterNames, selected.invocation, values[0], [
      { kind: "LiteralExpression", value: selected.name }, values[1]!,
    ]), selected.invocation.resultType);
    case "element-write": return buildCsharpPlannedValue(node, sourceFile, input, diagnostics, [
      planExpression(selected.receiver, sourceFile, input, diagnostics), planExpression(selected.key, sourceFile, input, diagnostics),
      planExpression(selected.value, sourceFile, input, diagnostics),
    ], values => translateCsharpJsValueInvocation(input.scope.typeParameterNames, selected.invocation, values[0], values.slice(1)), selected.invocation.resultType);
  }
}
