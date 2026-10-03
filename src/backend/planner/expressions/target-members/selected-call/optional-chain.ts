import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpCallClassification } from "../../../../../analysis/operations/index.js";
import { targetTypeRefEquals } from "../../../../../target-model/types/index.js";
import type { CsharpPlanningContext } from "../../../context.js";
import { unsupportedNodeDiagnostic } from "../../../diagnostics.js";
import { applyCsharpConversionSelection } from "../../conversions.js";
import type { CallArgumentPlanner, ExpressionPlanner } from "../../expression-planner-types.js";
import { translateCsharpPropertyAccess } from "../selected-property.js";
import { translateCsharpElementAccess } from "../selected-element.js";
import { csharpPlannedValue, mapCsharpPlannedValue, type CsharpPlannedValue } from "../../planned-values.js";
import { planCsharpOptionalReceiverValue } from "../../planned-value-composition.js";

export function planCsharpOptionalReceiverChain(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  planCallArgument: CallArgumentPlanner,
  planCall: (
    call: Node,
    context: CsharpPlanningContext,
    expressions: ExpressionPlanner,
    arguments_: CallArgumentPlanner,
  ) => CsharpPlannedValue | undefined,
): { readonly handled: boolean; readonly expression?: CsharpPlannedValue } {
  const chain: { readonly node: Node; readonly classification: CsharpCallClassification;
    readonly selected: NonNullable<CsharpCallClassification["optionalReceiver"] | CsharpCallClassification["optionalCallee"]> }[] = [];
  let current = node;
  for (;;) {
    const classification = input.program.operations.call(current);
    const selected = classification?.optionalReceiver ?? classification?.optionalCallee;
    if (classification === undefined || selected === undefined) break;
    chain.push({ node: current, classification, selected });
    current = selected.expression;
    if (!input.program.source.ast.is.IsCallExpression(current)) break;
  }
  const result = chain[0]?.classification.selectedResultType;
  if (chain.length === 1 && chain[0]?.classification.jsValue.kind === "resolved") return { handled: false };
  if (!chain.some(entry => entry.selected.guard)) {
    return { handled: false };
  }
  if (chain[chain.length - 1]?.selected.guard !== true) {
    diagnostics.push(unsupportedNodeDiagnostic(node,
      "Optional-call lowering requires the originating receiver guard in its exact selected call chain."));
    return { handled: true };
  }
  const receiver = planExpression(current, sourceFile, input, diagnostics);
  if (result === undefined || receiver === undefined) return { handled: true };
  chain.reverse();

  function step(index: number, value: CsharpPlannedValue): CsharpPlannedValue | undefined {
    const entry = chain[index];
    if (entry === undefined) return value;
    const selected = entry.selected;
    if (!targetTypeRefEquals(value.completion.carrier, selected.storage)) {
      diagnostics.push(unsupportedNodeDiagnostic(entry.node, "Optional receiver requires its exact native storage and present-value relation."));
      return undefined;
    }
    const continuePresent = (present: CsharpPlannedValue): CsharpPlannedValue | undefined => {
    const presentContext: CsharpPlanningContext = { ...input, scope: { ...input.scope,
      presentOptionalValues: new Set([...(input.scope.presentOptionalValues ?? []), selected.expression]),
    } };
    const expressions: ExpressionPlanner = (subject, file, context, errors, state) => {
      if (subject === selected.expression) return present;
      if (subject === entry.classification.source?.sourceCallee.expression) {
        if (input.program.source.ast.is.IsPropertyAccessExpression(subject)) {
          const property = translateCsharpPropertyAccess(subject, file, context, errors, expressions);
          return property === undefined ? undefined : mapCsharpPlannedValue(property, property.completion.carrier,
            expression => expression.kind === "ConditionalAccessExpression" ? { ...expression, kind: "SimpleMemberAccessExpression" } : expression);
        }
        if (input.program.source.ast.is.IsElementAccessExpression(subject)) {
          return translateCsharpElementAccess(subject, file, context, errors, expressions, arguments_);
        }
      }
      return planExpression(subject, file, context, errors, state);
    };
    const arguments_: CallArgumentPlanner = (subject, file, context, errors, expected, expectedSubject, target, mode, parameter) => {
      if (subject !== selected.expression) {
        return planCallArgument(subject, file, context, errors, expected, expectedSubject, target, mode, parameter);
      }
      if (!("conversion" in selected) || selected.conversion === undefined || selected.parameterType === undefined ||
        target === undefined || !targetTypeRefEquals(target, selected.parameterType) ||
        mode !== undefined && mode !== "by-value") {
        errors.push(unsupportedNodeDiagnostic(subject, "Optional receiver requires its exact sealed by-value parameter conversion."));
        return undefined;
      }
      return mapCsharpPlannedValue(present, selected.parameterType, value =>
        applyCsharpConversionSelection(subject, file, context, errors,
          selected.type, selected.parameterType, selected.conversion, value));
    };
    const call = planCall(entry.node, presentContext, expressions, arguments_);
    return call === undefined ? undefined : step(index + 1, call);
    };
    return selected.guard ? planCsharpOptionalReceiverValue(entry.node, sourceFile, input, diagnostics, value,
      present => continuePresent(csharpPlannedValue(selected.type, present)), result) : continuePresent(value);
  }
  const expression = step(0, receiver);
  return { handled: true, ...(expression === undefined ? {} : { expression }) };
}
