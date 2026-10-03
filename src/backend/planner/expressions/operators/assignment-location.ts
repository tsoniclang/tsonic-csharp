import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpAssignmentLocation } from "../../../../policy/operations/operators/assignment-location.js";
import type { CsharpExpression, CsharpStatement } from "../../../target-ast/roslyn/index.js";
import { allocateExpressionTemp, type DestructuringPlannerState } from "../../bindings/binding-state.js";
import { unsupportedNodeDiagnostic } from "../../diagnostics.js";
import type { CsharpPlannedValue } from "../planned-values.js";

export function planCsharpAssignmentLocation(
  node: Node,
  selection: CsharpAssignmentLocation,
  planned: CsharpPlannedValue,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState | undefined,
  build: (location: CsharpExpression) => CsharpPlannedValue | undefined,
): CsharpPlannedValue | undefined {
  if (planned.completion.kind === "never") return planned;
  if (planned.completion.kind !== "value") return undefined;
  let left = planned.completion.expression;
  while (left.kind === "ParenthesizedExpression") left = left.expression;
  if (selection === "direct") {
    const result = build(left);
    return result === undefined ? undefined : { prelude: [...planned.prelude, ...result.prelude], completion: result.completion };
  }
  if (selection !== "reference-receiver" || state === undefined ||
    (left.kind !== "SimpleMemberAccessExpression" && left.kind !== "ElementAccessExpression")) {
    diagnostics.push(unsupportedNodeDiagnostic(node,
      "Read-modify-write requires a binding or an exact native reference-receiver location and hygienic evaluation scope."));
    return undefined;
  }
  const prelude: CsharpStatement[] = [...planned.prelude];
  const capture = (expression: CsharpExpression): CsharpExpression => {
    const name = allocateExpressionTemp(state);
    prelude.push({ kind: "LocalDeclarationStatement", name, type: { kind: "IdentifierName", name: "var" }, initializer: expression });
    return { kind: "IdentifierName", name };
  };
  const receiver = capture(left.receiver);
  const location: CsharpExpression = left.kind === "SimpleMemberAccessExpression"
    ? { ...left, receiver }
    : { ...left, receiver, arguments: left.arguments.map(capture) };
  const result = build(location);
  return result === undefined ? undefined : { prelude: [...prelude, ...result.prelude], completion: result.completion };
}
