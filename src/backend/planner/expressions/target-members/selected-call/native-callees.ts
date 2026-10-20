import type { SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpSourceCalleeSelection } from "../../../../../target-model/operations/source-callees.js";
import type { CsharpExpression } from "../../../../target-ast/syntax/index.js";
import type { CsharpPlanningContext } from "../../../context.js";
import type { ExpressionPlanner } from "../../expression-planner-types.js";
import { csharpPlannedValue, type CsharpPlannedValue, type CsharpPlannedEffectOperand } from "../../planned-values.js";
import { planIdentifierExpression, tryPlanProjectSourceModuleStaticMemberReference } from "../../expression-source-references.js";
import type { DestructuringPlannerState } from "../../../bindings/binding-state.js";
import { csharpProjectTypeReceiver, translateCsharpSelectedReceiver } from "../../receivers.js";
import { planCsharpSourceMemberName } from "../source-member-names.js";
import { planCsharpDiscardedOperand } from "../../../statements/statement-output.js";
import { composeCsharpPlannedValues } from "../../planned-value-composition.js";
import { captureCsharpPlannedMemberReceiver } from "../../planned-locations.js";
import { failCsharpPlannerInvariant } from "../../../../invariants.js";

export function planCsharpNativeFunctionCallee(selected: Extract<CsharpSourceCalleeSelection, { readonly kind: "function" }>,
  sourceFile: SourceFile, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[], state: DestructuringPlannerState | undefined): CsharpExpression {
  const form = input.program.records.nativeFunctionCallee.get(selected.expression);
  if (form === undefined) failCsharpPlannerInvariant("An admitted native function requires its exact source acquisition plan.", selected.expression);
  return (form === "identifier" ? planIdentifierExpression(selected.expression, sourceFile, input, diagnostics, state)
    : tryPlanProjectSourceModuleStaticMemberReference(selected.expression, sourceFile, input, diagnostics)) ??
    failCsharpPlannerInvariant("An admitted native function group requires its exact declaration reference syntax.", selected.expression);
}

export function planCsharpNativeMethodCallee(selected: Extract<CsharpSourceCalleeSelection, { readonly kind: "method" }>,
  sourceFile: SourceFile, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[], planExpression: ExpressionPlanner):
  | { readonly kind: "type"; readonly receiver: CsharpExpression; readonly name: string; readonly effect?: CsharpPlannedEffectOperand }
  | { readonly kind: "value"; readonly receiver: CsharpPlannedValue; readonly name: string }
  | undefined {
  const member = input.program.records.nativeMethodCallee.get(selected.expression);
  if (member === undefined) failCsharpPlannerInvariant("An admitted native method requires its exact sealed member acquisition plan.", selected.expression);
  const name = planCsharpSourceMemberName(selected.expression, false, input);
  const projectType = csharpProjectTypeReceiver(member.receiver, input, diagnostics);
  const effect = member.key === undefined ? undefined : planCsharpDiscardedOperand(planExpression(member.key, sourceFile, input, diagnostics));
  if (member.key !== undefined && effect === undefined) return undefined;
  if (projectType !== undefined) return { kind: "type", receiver: projectType, name, ...(effect === undefined ? {} : { effect }) };
  const receiver = translateCsharpSelectedReceiver(member.receiver, sourceFile, input, diagnostics, planExpression, member.projection);
  if (receiver === undefined || effect === undefined) return receiver === undefined ? undefined : { kind: "value", receiver, name };
  const sequenced = composeCsharpPlannedValues(selected.expression, sourceFile, input, diagnostics, [receiver, effect],
    values => csharpPlannedValue(receiver.completion.carrier, values[0]!), (carrier, operand) =>
      captureCsharpPlannedMemberReceiver(selected.expression, sourceFile, input, diagnostics, member.receiver.expression, carrier, operand, member.suspends, false));
  return sequenced === undefined ? undefined : { kind: "value", receiver: sequenced, name };
}
