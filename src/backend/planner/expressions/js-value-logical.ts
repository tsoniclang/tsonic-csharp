import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpPlanningContext } from "../context.js";
import type { CsharpJsValueOperationSelection } from "../../../target-model/operations/js-values.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";
import { csharpPlannedValue, type CsharpPlannedValue } from "./planned-values.js";
import { planCsharpJsValueBox, translateCsharpJsValueInvocation } from "./js-value-operations.js";
import { projectCsharpPlannedValue, planCsharpValueBranch } from "./planned-value-composition.js";

export function planCsharpJsValueLogical(node: Node, sourceFile: SourceFile, input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[], operation: Extract<CsharpJsValueOperationSelection, { readonly kind: "resolved" }>,
  leftNode: Node, rightNode: Node, left: CsharpPlannedValue, right: CsharpPlannedValue): CsharpPlannedValue {
  const selected = operation.shortCircuit
    ?? failCsharpPlannerInvariant("An admitted closed logical expression requires its native condition and lazy branch relation.", node);
  if (left.completion.kind === "never") return left;
  if (left.completion.kind !== "value" || right.completion.kind === "void")
    failCsharpPlannerInvariant("An admitted closed logical expression requires native value operands.", node);
  const carrier = operation.resultType;
  const boxedLeft = projectCsharpPlannedValue(leftNode, sourceFile, input, diagnostics, left,
    value => planCsharpJsValueBox(leftNode, input, diagnostics, left.completion.carrier, value), carrier);
  const boxedRight = projectCsharpPlannedValue(rightNode, sourceFile, input, diagnostics, right,
    value => planCsharpJsValueBox(rightNode, input, diagnostics, right.completion.carrier, value), carrier);
  if (boxedLeft === undefined || boxedRight === undefined || boxedLeft.completion.kind !== "value")
    failCsharpPlannerInvariant("An admitted closed logical expression requires its native operand projections.", node);
  const name = input.names.temporaryName(`__tsonic_logical_${input.program.source.ast.pos(node)}`);
  const reference = { kind: "IdentifierName" as const, name };
  const condition = translateCsharpJsValueInvocation(input.scope.typeParameterNames, selected.condition,
    selected.condition.dispatch === "instance" ? reference : undefined, selected.condition.dispatch === "instance" ? [] : [reference])
    ?? failCsharpPlannerInvariant("An admitted closed logical expression requires its native condition invocation.", node);
  const boundCondition = csharpPlannedValue(selected.condition.resultType, {
    kind: "BinaryExpression", operatorToken: { kind: "AmpersandAmpersandToken" },
    left: { kind: "IsPatternExpression", expression: boxedLeft.completion.expression,
      type: { kind: "IdentifierName", name: "var" }, designation: name }, right: condition,
  }, boxedLeft.prelude);
  const selectedLeft = csharpPlannedValue(carrier, reference);
  return planCsharpValueBranch(node, sourceFile, input, diagnostics, boundCondition,
    selected.whenTrue === "left" ? selectedLeft : boxedRight,
    selected.whenTrue === "left" ? boxedRight : selectedLeft, operation.resultType)
    ?? failCsharpPlannerInvariant("An admitted closed logical expression requires its native lazy branch plan.", node);
}
