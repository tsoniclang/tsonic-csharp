import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpAssignmentLocation } from "../../../../policy/operations/operators/assignment-location.js";
import type { CsharpExpression, CsharpTypeNode } from "../../../target-ast/roslyn/index.js";
import { allocateExpressionTemp, type DestructuringPlannerState } from "../../bindings/binding-state.js";
import { unsupportedNodeDiagnostic } from "../../diagnostics.js";

export function planCsharpAssignmentLocation(
  node: Node,
  selection: CsharpAssignmentLocation,
  left: CsharpExpression,
  resultType: CsharpTypeNode,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState | undefined,
  build: (location: CsharpExpression) => CsharpExpression | undefined,
): CsharpExpression | undefined {
  if (selection === "direct") return build(left);
  if (selection !== "reference-receiver" || state === undefined ||
    (left.kind !== "SimpleMemberAccessExpression" && left.kind !== "ElementAccessExpression")) {
    diagnostics.push(unsupportedNodeDiagnostic(node,
      "Read-modify-write requires a binding or an exact native reference-receiver location and hygienic evaluation scope."));
    return undefined;
  }
  const name = allocateExpressionTemp(state);
  const reference: CsharpExpression = { kind: "IdentifierName", name };
  const inputs = left.kind === "ElementAccessExpression" ? [left.receiver, ...left.arguments] : [left.receiver];
  const receiver: CsharpExpression = inputs.length === 1 ? reference : {
    kind: "SimpleMemberAccessExpression", receiver: reference, name: "Item1",
  };
  const location: CsharpExpression = left.kind === "SimpleMemberAccessExpression"
    ? { ...left, receiver }
    : { ...left, receiver, arguments: left.arguments.map((_, index) => ({
      kind: "SimpleMemberAccessExpression", receiver: reference, name: `Item${index + 2}`,
    })) };
  const value = build(location);
  if (value === undefined) return undefined;
  return {
    kind: "ConditionalExpression",
    condition: { kind: "IsPatternExpression", expression: inputs.length === 1 ? inputs[0]! : { kind: "TupleExpression", elements: inputs },
      type: { kind: "IdentifierName", name: "var" }, designation: name },
    whenTrue: value,
    whenFalse: { kind: "DefaultExpression", type: resultType },
  };
}
