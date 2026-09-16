import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpCallClassification } from "../../../../../analysis/operations/index.js";
import { targetTypeRefEquals } from "../../../../../target-model/types/index.js";
import type { CsharpExpression } from "../../../../target-ast/roslyn/index.js";
import type { CsharpPlanningContext } from "../../../context.js";
import { unsupportedNodeDiagnostic } from "../../../diagnostics.js";
import { csharpTypeFromTargetTypeRef } from "../../../types/target-types.js";
import { applyCsharpConversionSelection } from "../../conversions.js";
import type { CallArgumentPlanner, ExpressionPlanner } from "../../expression-planner-types.js";
import { translateCsharpPropertyAccess } from "../selected-property.js";
import { translateCsharpElementAccess } from "../selected-element.js";

export function planCsharpOptionalReceiverChain(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  planCallArgument: CallArgumentPlanner,
  planCall: (
    call: Node,
    expressions: ExpressionPlanner,
    arguments_: CallArgumentPlanner,
  ) => CsharpExpression | undefined,
): { readonly handled: boolean; readonly expression?: CsharpExpression } {
  const chain: { readonly node: Node; readonly classification: CsharpCallClassification }[] = [];
  let current = node;
  for (;;) {
    const classification = input.program.operations.call(current);
    if (classification?.optionalReceiver === undefined) break;
    chain.push({ node: current, classification });
    current = classification.optionalReceiver.expression;
    if (!input.program.source.ast.is.IsCallExpression(current)) break;
  }
  if (!chain.some(entry => entry.classification.optionalReceiver?.guard === true) ||
    !chain.some(entry => entry.classification.target?.kind === "resolved" &&
      entry.classification.target.call.receiver.kind === "target-parameter")) {
    return { handled: false };
  }
  const result = chain[0]?.classification.selectedResultType;
  const resultType = result === undefined ? undefined : csharpTypeFromTargetTypeRef(result);
  const receiver = planExpression(current, sourceFile, input, diagnostics);
  if (resultType === undefined || receiver === undefined) return { handled: true };
  chain.reverse();

  function step(index: number, value: CsharpExpression): CsharpExpression | undefined {
    const entry = chain[index];
    if (entry === undefined) return value;
    const selected = entry.classification.optionalReceiver!;
    const type = csharpTypeFromTargetTypeRef(selected.type);
    if (type === undefined) return undefined;
    const name = `__tsonic_optionalReceiver_${Math.max(0, input.program.source.ast.pos(entry.node))}_${Math.max(0, input.program.source.ast.end(entry.node))}`;
    const present: CsharpExpression = selected.guard ? { kind: "IdentifierName", name } : value;
    const expressions: ExpressionPlanner = (subject, file, context, errors, state) => {
      if (subject === selected.expression) return present;
      if (subject === entry.classification.source?.sourceCallee.expression) {
        if (input.program.source.ast.is.IsPropertyAccessExpression(subject)) {
          return translateCsharpPropertyAccess(subject, file, context, errors, expressions);
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
      if (selected.conversion === undefined || selected.parameterType === undefined ||
        target === undefined || !targetTypeRefEquals(target, selected.parameterType) ||
        mode !== undefined && mode !== "by-value") {
        errors.push(unsupportedNodeDiagnostic(subject, "Optional receiver requires its exact sealed by-value parameter conversion."));
        return undefined;
      }
      const converted = applyCsharpConversionSelection(subject, file, context, errors,
        selected.type, selected.parameterType, selected.conversion, present);
      return converted === undefined ? undefined : { kind: "Argument", expression: converted };
    };
    const plannedCall = planCall(entry.node, expressions, arguments_);
    const call = plannedCall?.kind === "InvocationExpression" &&
      plannedCall.callee.kind === "ConditionalAccessExpression"
      ? { ...plannedCall, callee: { ...plannedCall.callee, kind: "SimpleMemberAccessExpression" as const } }
      : plannedCall;
    const next = call === undefined ? undefined : step(index + 1, call);
    if (next === undefined || !selected.guard) return next;
    return {
      kind: "ConditionalExpression",
      condition: { kind: "IsPatternExpression", expression: value, type, designation: name },
      whenTrue: next,
      whenFalse: { kind: "DefaultExpression", type: resultType! },
    };
  }
  const expression = step(0, receiver);
  return { handled: true, ...(expression === undefined ? {} : { expression }) };
}
