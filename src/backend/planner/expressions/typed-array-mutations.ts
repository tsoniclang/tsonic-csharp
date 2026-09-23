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

export function planTypedArrayMutation(
  node: Node,
  selection: CsharpTypedArrayMutation | CsharpTypedArrayUpdate,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  planExpected: ExpectedExpressionPlanner,
  state: DestructuringPlannerState | undefined,
): CsharpExpression | undefined {
  const receiver = planExpression(selection.receiver, sourceFile, input, diagnostics);
  const index = planExpression(selection.index, sourceFile, input, diagnostics);
  if (receiver === undefined || index === undefined) return undefined;
  const invoke = (owner: CsharpExpression, name: string, args: readonly CsharpExpression[]): CsharpExpression => ({
    kind: "InvocationExpression", callee: { kind: "SimpleMemberAccessExpression", receiver: owner, name },
    arguments: args.map(expression => ({ kind: "Argument", expression })),
  });
  if (selection.kind === "update-typed-element") {
    const type = csharpTypeFromTargetTypeRef(selection.resultType);
    const indexType = csharpTypeFromTargetTypeRef(selection.indexType);
    if (type === undefined || indexType === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(node, "Typed array update has no sealed native result type."));
      return undefined;
    }
    return {
      kind: "InvocationExpression",
      callee: { kind: "SimpleMemberAccessExpression", receiver, name: "Update", typeArguments: [type, indexType] },
      arguments: [index, { kind: "LiteralExpression" as const, value: selection.increment },
        { kind: "LiteralExpression" as const, value: selection.prefix }].map(expression => ({ kind: "Argument", expression })),
    };
  }
  if (selection.calculation === undefined) {
    const value = planExpression(selection.value, sourceFile, input, diagnostics);
    return value === undefined ? undefined : invoke(receiver, "Set", [index, value]);
  }
  const type = csharpTypeFromTargetTypeRef(selection.resultType);
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
  let value: CsharpExpression | undefined;
  try {
    value = planSelectedCsharpBinaryOperation(node, selection.calculation, sourceFile, input,
      diagnostics, planExpression, planExpected, state);
  } finally {
    if (previous === undefined) state.expressionOverrides.delete(left);
    else state.expressionOverrides.set(left, previous);
  }
  return value === undefined ? undefined : {
    kind: "ConditionalExpression",
    condition: { kind: "IsPatternExpression", expression: { kind: "TupleExpression", elements: [receiver, index] },
      type: { kind: "IdentifierName", name: "var" }, designation: name },
    whenTrue: invoke(owner, "Set", [offset, value]),
    whenFalse: { kind: "DefaultExpression", type },
  };
}
