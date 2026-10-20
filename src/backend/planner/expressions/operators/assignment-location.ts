import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpAssignmentLocation } from "../../../../target-model/operations/assignment-locations.js";
import type { CsharpExpression, CsharpStatement } from "../../../target-ast/syntax/index.js";
import { allocateExpressionTemp, type DestructuringPlannerState } from "../../bindings/binding-state.js";
import { failCsharpPlannerInvariant } from "../../../invariants.js";
import type { CsharpPlannedValue } from "../planned-values.js";
import { csharpPlannedAddressOperand } from "../planned-locations.js";

export function planCsharpAssignmentLocation(
  node: Node,
  selection: CsharpAssignmentLocation,
  planned: CsharpPlannedValue,
  _diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState | undefined,
  build: (location: CsharpExpression) => CsharpPlannedValue | undefined,
): CsharpPlannedValue | undefined {
  if (planned.completion.kind === "never") return planned;
  if (planned.completion.kind !== "value") return undefined;
  let operand = csharpPlannedAddressOperand(planned);
  while (operand.address?.kind === "parenthesized") operand = operand.address.operand;
  const left = operand.expression;
  if (selection === "direct") {
    const result = build(left);
    return result === undefined ? undefined : { ...result, prelude: [...planned.prelude, ...result.prelude] };
  }
  if (selection !== "reference-receiver" || state === undefined ||
    (operand.address?.kind !== "member" && operand.address?.kind !== "element")) {
    failCsharpPlannerInvariant("An admitted read-modify-write requires its exact native location operands and hygienic scope.", node);
  }
  const prelude: CsharpStatement[] = [...planned.prelude];
  const capture = (expression: CsharpExpression): CsharpExpression => {
    const name = allocateExpressionTemp(state);
    prelude.push({ kind: "LocalDeclarationStatement", name, type: { kind: "IdentifierName", name: "var" }, initializer: expression });
    return { kind: "IdentifierName", name };
  };
  const selected = operand.address;
  const receiver = selected.receiver.receiverIdentity === true ? selected.receiver.expression : capture(selected.receiver.expression);
  const location: CsharpExpression = selected.kind === "member"
    ? { kind: "SimpleMemberAccessExpression", receiver, name: selected.name }
    : { kind: "ElementAccessExpression", receiver, arguments: selected.arguments.map(capture) };
  const result = build(location);
  return result === undefined ? undefined : { ...result, prelude: [...prelude, ...result.prelude] };
}
