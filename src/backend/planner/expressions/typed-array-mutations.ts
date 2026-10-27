import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpTypedArrayMutation, CsharpTypedArrayUpdate } from "../../../target-model/records/storage/typed-array-mutations.js";
import type { CsharpExpression } from "../../target-ast/syntax/index.js";
import type { CsharpPlanningContext } from "../context.js";
import { allocateExpressionTemp, type DestructuringPlannerState } from "../bindings/binding-state.js";
import { csharpTypeFromTargetTypeRef } from "../types/render.js";
import type { ExpressionPlanner } from "./expression-planner-types.js";
import { planSelectedCsharpBinaryOperation } from "./selected-binary.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";
import { csharpPlannedValue, type CsharpPlannedValue } from "./planned-values.js";
import { buildCsharpPlannedValue, composeCsharpPlannedValues, projectCsharpPlannedValue } from "./planned-value-composition.js";

export function planTypedArrayMutation(
  node: Node,
  selection: CsharpTypedArrayMutation | CsharpTypedArrayUpdate,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
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
      failCsharpPlannerInvariant("An admitted typed array update requires its native result and index types.", node);
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
    failCsharpPlannerInvariant("An admitted typed array mutation requires its result type and hygienic scope.", node);
  }
  const name = allocateExpressionTemp(state);
  const selected: CsharpExpression = { kind: "IdentifierName", name };
  const owner: CsharpExpression = { kind: "SimpleMemberAccessExpression", receiver: selected, name: "Item1" };
  const offset: CsharpExpression = { kind: "SimpleMemberAccessExpression", receiver: selected, name: "Item2" };
  // The element read of the compound assignment is the held element (owner.Get(offset)) at its element carrier; its
  // receiver and index are evaluated once, by the tuple above.
  const left = selection.calculation.left;
  const element = csharpPlannedValue(selection.calculation.leftType, invoke(owner, "Get", [offset]));
  const planCalculationOperand: ExpressionPlanner = (subject, file, context, errors, nested) =>
    subject === left ? element : planExpression(subject, file, context, errors, nested);
  const value = planSelectedCsharpBinaryOperation(node, selection.calculation, sourceFile, input, diagnostics, planCalculationOperand, state);
  const result = projectCsharpPlannedValue(node, sourceFile, input, diagnostics, value,
    expression => invoke(owner, "Set", [offset, expression]), selection.resultType);
  return composeCsharpPlannedValues(node, sourceFile, input, diagnostics, [receiver, index], values =>
    result === undefined ? undefined : {
      prelude: [{ kind: "LocalDeclarationStatement", name, type: { kind: "IdentifierName", name: "var" },
        initializer: { kind: "TupleExpression", elements: values } }, ...result.prelude],
      completion: result.completion,
    });
}
