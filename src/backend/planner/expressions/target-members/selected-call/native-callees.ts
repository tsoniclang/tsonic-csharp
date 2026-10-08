import type { SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpSourceCalleeSelection } from "../../../../../target-model/operations/source-callees.js";
import type { CsharpExpression } from "../../../../target-ast/roslyn/index.js";
import type { CsharpPlanningContext } from "../../../context.js";
import type { ExpressionPlanner } from "../../expression-planner-types.js";
import { csharpPlannedValue, type CsharpPlannedValue, type CsharpPlannedEffectOperand } from "../../planned-values.js";
import { tryPlanProjectSourceModuleStaticMemberReference } from "../../expression-source-references.js";
import { csharpProjectTypeReceiver, translateCsharpSelectedReceiver } from "../../receivers.js";
import { planCsharpSourceMemberName } from "../source-member-names.js";
import { unsupportedNodeDiagnostic } from "../../../diagnostics.js";
import { planCsharpDiscardedOperand } from "../../../statements/statement-output.js";
import { composeCsharpPlannedValues } from "../../planned-value-composition.js";
import { captureCsharpPlannedMemberReceiver } from "../../planned-locations.js";

export function planCsharpNativeFunctionCallee(
  selected: Extract<CsharpSourceCalleeSelection, { readonly kind: "function" }>,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  const identifier = input.program.source.ast.is.IsIdentifier(selected.expression)
    ? planExpression(selected.expression, sourceFile, input, diagnostics) : undefined;
  const callee = input.program.source.ast.is.IsIdentifier(selected.expression)
    ? identifier?.prelude.length === 0 && identifier.completion.kind === "value"
      ? identifier.completion.expression : undefined
    : tryPlanProjectSourceModuleStaticMemberReference(selected.expression, sourceFile, input, diagnostics);
  if (callee === undefined) diagnostics.push(unsupportedNodeDiagnostic(selected.expression,
    "A selected native function group has no exact declaration reference syntax."));
  return callee;
}

export function planCsharpNativeMethodCallee(
  selected: Extract<CsharpSourceCalleeSelection, { readonly kind: "method" }>,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
):
  | { readonly kind: "type"; readonly receiver: CsharpExpression; readonly name: string; readonly effect?: CsharpPlannedEffectOperand }
  | { readonly kind: "value"; readonly receiver: CsharpPlannedValue; readonly name: string }
  | undefined {
  const element = input.program.operations.element(selected.expression);
  const property = input.program.operations.property(selected.expression);
  const selection = element?.target ?? property?.selection;
  const sourceOwned = input.program.operations.sourceMember(selected.expression);
  if (selection?.kind !== "source-owned" || sourceOwned === undefined || !selection.source.callCallee ||
    sourceOwned.jsValueOperation.kind !== "not-js-value" || sourceOwned.runtimeUnionProperty.kind !== "not-runtime-union" ||
    sourceOwned.objectShape !== undefined && sourceOwned.shapeMember?.kind !== "resolved" ||
    sourceOwned.shapeMember !== undefined && sourceOwned.shapeMember.kind !== "resolved" ||
    sourceOwned.shapeMember?.kind === "resolved" && sourceOwned.shapeMember.member.memberKind !== "method") {
    diagnostics.push(unsupportedNodeDiagnostic(selected.expression, "A direct source method requires its exact sealed native member selection."));
    return undefined;
  }
  const name = planCsharpSourceMemberName(selected.expression, selection.source.selectedDeclaration, sourceOwned, false, input, diagnostics);
  if (name === undefined) return undefined;
  const projectType = csharpProjectTypeReceiver(selection.source.receiver, input, diagnostics);
  const projection = element?.receiverProjection ?? property?.receiverProjection;
  if (projectType !== undefined && projection?.conversion.kind === "rejected") {
    diagnostics.push(unsupportedNodeDiagnostic(selected.expression, projection.conversion.reason));
    return undefined;
  }
  const key = "argument" in selection.source ? selection.source.argument.expression : undefined;
  const effect = key === undefined ? undefined : planCsharpDiscardedOperand(planExpression(key, sourceFile, input, diagnostics));
  if (key !== undefined && effect === undefined) return undefined;
  if (projectType !== undefined) return { kind: "type", receiver: projectType, name, ...(effect === undefined ? {} : { effect }) };
  const receiver = translateCsharpSelectedReceiver(selection.source.receiver, sourceFile, input, diagnostics,
    planExpression, projection);
  if (receiver === undefined || effect === undefined) return receiver === undefined ? undefined : { kind: "value", receiver, name };
  const sequenced = composeCsharpPlannedValues(selected.expression, sourceFile, input, diagnostics, [receiver, effect],
    values => csharpPlannedValue(receiver.completion.carrier, values[0]!),
    (carrier, operand) => captureCsharpPlannedMemberReceiver(selected.expression, sourceFile, input, diagnostics,
      selection.source.receiver.expression, carrier, operand,
      input.program.sourceNavigation.expressionEffects(key!).suspends, false));
  return sequenced === undefined ? undefined : { kind: "value", receiver: sequenced, name };
}
