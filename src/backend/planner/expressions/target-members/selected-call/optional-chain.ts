import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpPlanningContext } from "../../../context.js";
import { failCsharpPlannerInvariant } from "../../../../invariants.js";
import { applyCsharpConversionSelection } from "../../conversions.js";
import type { CallArgumentPlanner, ExpressionPlanner } from "../../expression-planner-types.js";
import { translateCsharpPropertyAccess } from "../selected-property.js";
import { translateCsharpElementAccess } from "../selected-element.js";
import { csharpPlannedValue, mapCsharpPlannedValue, type CsharpPlannedValue } from "../../planned-values.js";
import { planCsharpOptionalReceiverValue } from "../../planned-value-composition.js";

export function planCsharpOptionalReceiverChain(node: Node, sourceFile: SourceFile, input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[], planExpression: ExpressionPlanner, planCallArgument: CallArgumentPlanner,
  planCall: (call: Node, context: CsharpPlanningContext, expressions: ExpressionPlanner, arguments_: CallArgumentPlanner) => CsharpPlannedValue | undefined,
): { readonly handled: boolean; readonly expression?: CsharpPlannedValue } {
  const chain = input.program.records.optionalCallChain.get(node);
  if (chain === undefined) failCsharpPlannerInvariant("An admitted call requires its exact optional-receiver chain plan.", node);
  if (chain.kind === "direct") return { handled: false };
  const { steps, result } = chain;
  const receiver = planExpression(chain.receiver, sourceFile, input, diagnostics);
  if (receiver === undefined) return { handled: true };
  function step(index: number, value: CsharpPlannedValue): CsharpPlannedValue | undefined {
    const entry = steps[index];
    if (entry === undefined) return value;
    const continuePresent = (present: CsharpPlannedValue): CsharpPlannedValue | undefined => {
      const presentContext: CsharpPlanningContext = { ...input, scope: { ...input.scope,
        presentOptionalValues: new Set([...(input.scope.presentOptionalValues ?? []), entry.expression]),
      } };
      const expressions: ExpressionPlanner = (subject, file, context, errors, state) => {
        if (subject === entry.expression) return present;
        if (subject === entry.callee) {
          if (input.program.source.ast.is.IsPropertyAccessExpression(subject)) return translateCsharpPropertyAccess(subject, file, context, errors, expressions);
          if (input.program.source.ast.is.IsElementAccessExpression(subject)) return translateCsharpElementAccess(subject, file, context, errors, expressions, arguments_);
        }
        return planExpression(subject, file, context, errors, state);
      };
      const arguments_: CallArgumentPlanner = (subject, file, context, errors, target, mode, parameter) => {
        if (subject !== entry.expression) return planCallArgument(subject, file, context, errors, target, mode, parameter);
        const argument = entry.argument;
        if (argument === undefined) failCsharpPlannerInvariant("An admitted optional receiver argument requires its sealed by-value conversion.", subject);
        return mapCsharpPlannedValue(present, argument.type, value =>
          applyCsharpConversionSelection(subject, file, context, errors, entry.type, argument.type, argument.conversion, value));
      };
      const call = planCall(entry.node, presentContext, expressions, arguments_);
      return call === undefined ? undefined : step(index + 1, call);
    };
    return entry.guard ? planCsharpOptionalReceiverValue(entry.node, sourceFile, input, diagnostics, value,
      present => continuePresent(csharpPlannedValue(entry.type, present)), result) : continuePresent(value);
  }
  const expression = step(0, receiver);
  return { handled: true, ...(expression === undefined ? {} : { expression }) };
}
