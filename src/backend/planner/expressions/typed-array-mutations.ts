import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpTypedArrayMutation, CsharpTypedArrayUpdate } from "../../../analysis/operations/index.js";
import type { CsharpExpression } from "../../target-ast/roslyn/index.js";
import type { CsharpPlanningContext } from "../context.js";
import { allocateExpressionTemp, type DestructuringPlannerState } from "../bindings/binding-state.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import type { ExpressionPlanner, ExpectedExpressionPlanner } from "./expression-planner-types.js";
import { planSelectedCsharpBinaryOperation } from "./operators/selected-binary.js";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";
import { type CsharpPlannedValue } from "./planned-values.js";
import { buildCsharpPlannedValue, composeCsharpPlannedValues, projectCsharpPlannedValue } from "./planned-value-composition.js";

export function planTypedArrayMutation(
  node: Node,
  selection: CsharpTypedArrayMutation | CsharpTypedArrayUpdate,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  planExpected: ExpectedExpressionPlanner,
  state: DestructuringPlannerState | undefined,
): CsharpPlannedValue | undefined {
  const receiver = planExpression(selection.receiver, sourceFile, input, diagnostics);
  const index = planExpression(selection.index, sourceFile, input, diagnostics);
  if (receiver === undefined || index === undefined) return undefined;
  const invoke = (owner: CsharpExpression, name: string, args: readonly CsharpExpression[]): CsharpExpression => ({
    kind: "InvocationExpression", callee: { kind: "SimpleMemberAccessExpression", receiver: owner, name },
    arguments: args.map(expression => ({ kind: "Argument", expression })),
  });
  if (selection.kind === "update-typed-element") {
    const type = csharpTypeFromTargetTypeRef(selection.resultType, input.scope.typeParameterNames);
    const indexType = csharpTypeFromTargetTypeRef(selection.indexType, input.scope.typeParameterNames);
    if (type === undefined || indexType === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(node, "Typed array update has no sealed native result type."));
      return undefined;
    }
    return buildCsharpPlannedValue(node, sourceFile, input, diagnostics, [receiver, index], values => ({
      kind: "InvocationExpression",
      callee: { kind: "SimpleMemberAccessExpression", receiver: values[0]!, name: "Update", typeArguments: [type, indexType] },
      arguments: [values[1]!, { kind: "LiteralExpression" as const, value: selection.increment },
        { kind: "LiteralExpression" as const, value: selection.prefix }].map(expression => ({ kind: "Argument", expression })),
    }), selection.resultType);
  }
  if (selection.calculation === undefined) {
    const value = planExpression(selection.value, sourceFile, input, diagnostics);
    return buildCsharpPlannedValue(node, sourceFile, input, diagnostics, [receiver, index, value],
      values => invoke(values[0]!, "Set", [values[1]!, values[2]!]), selection.resultType);
  }
  const type = csharpTypeFromTargetTypeRef(selection.resultType, input.scope.typeParameterNames);
  if (state === undefined || type === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Typed array mutation requires its sealed result type and hygienic scope."));
    return undefined;
  }
  const name = allocateExpressionTemp(state);
  const selected: CsharpExpression = { kind: "IdentifierName", name };
  const owner: CsharpExpression = { kind: "SimpleMemberAccessExpression", receiver: selected, name: "Item1" };
  const offset: CsharpExpression = { kind: "SimpleMemberAccessExpression", receiver: selected, name: "Item2" };
  const left = selection.calculation.left;
  const previous = state.expressionOverrides.get(left);
  state.expressionOverrides.set(left, invoke(owner, "Get", [offset]));
  let value: CsharpPlannedValue | undefined;
  try {
    value = planSelectedCsharpBinaryOperation(node, selection.calculation, sourceFile, input,
      diagnostics, planExpression, planExpected, state);
  } finally {
    if (previous === undefined) state.expressionOverrides.delete(left);
    else state.expressionOverrides.set(left, previous);
  }
  const result = projectCsharpPlannedValue(node, sourceFile, input, diagnostics, value,
    expression => invoke(owner, "Set", [offset, expression]), selection.resultType);
  return composeCsharpPlannedValues(node, sourceFile, input, diagnostics, [receiver, index], values =>
    result === undefined ? undefined : {
      prelude: [{ kind: "LocalDeclarationStatement", name, type: { kind: "IdentifierName", name: "var" },
        initializer: { kind: "TupleExpression", elements: values } }, ...result.prelude],
      completion: result.completion,
    });
}
