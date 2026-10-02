import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpCallClassification } from "../../../../../analysis/operations/index.js";
import { getCsharpNullableElementTargetType, isCsharpValueTypeTargetType, targetTypeRefEquals } from "../../../../../target-model/types/index.js";
import { csharpCarrierAdmitsSourceAbsence } from "../../../../../target-model/types/runtime-carriers.js";
import { getCsharpGenericOptionalParts } from "../../../../../target-model/types/projections.js";
import type { CsharpExpression } from "../../../../target-ast/roslyn/index.js";
import type { CsharpPlanningContext } from "../../../context.js";
import { unsupportedNodeDiagnostic } from "../../../diagnostics.js";
import { csharpTypeFromTargetTypeRef } from "../../../types/target-types.js";
import { applyCsharpConversionSelection } from "../../conversions.js";
import type { CallArgumentPlanner, ExpressionPlanner } from "../../expression-planner-types.js";
import { translateCsharpPropertyAccess } from "../selected-property.js";
import { translateCsharpElementAccess } from "../selected-element.js";
import { planCsharpAbsentValue } from "../../optional-storage.js";

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
  const result = chain[0]?.classification.selectedResultType;
  const nativeAbsenceBranch = result !== undefined && (getCsharpGenericOptionalParts(result) !== undefined ||
    isCsharpValueTypeTargetType(result) && getCsharpNullableElementTargetType(result) === undefined &&
      csharpCarrierAdmitsSourceAbsence(result));
  const resultProjection = chain.some(entry => entry.classification.sourceResult !== undefined &&
    !targetTypeRefEquals(entry.classification.sourceResult.nativeType, entry.classification.sourceResult.selectedType));
  if (!chain.some(entry => entry.classification.optionalReceiver?.guard === true) ||
    !nativeAbsenceBranch && !resultProjection && !chain.some(entry => entry.classification.target?.kind === "resolved" &&
      entry.classification.target.call.receiver.kind === "target-parameter")) {
    return { handled: false };
  }
  if (chain[chain.length - 1]?.classification.optionalReceiver?.guard !== true) {
    diagnostics.push(unsupportedNodeDiagnostic(node,
      "Optional-call lowering requires the originating receiver guard in its exact selected call chain."));
    return { handled: true };
  }
  const absent = result === undefined ? undefined : planCsharpAbsentValue(result, input.scope.typeParameterNames);
  const receiver = planExpression(current, sourceFile, input, diagnostics);
  if (absent === undefined || receiver === undefined) return { handled: true };
  chain.reverse();

  function step(index: number, value: CsharpExpression): CsharpExpression | undefined {
    const entry = chain[index];
    if (entry === undefined) return value;
    const selected = entry.classification.optionalReceiver!;
    const type = csharpTypeFromTargetTypeRef(selected.type, input.scope.typeParameterNames);
    if (type === undefined) return undefined;
    const name = input.names.temporaryName(`__tsonic_optionalReceiver_${Math.max(0, input.program.source.ast.pos(entry.node))}_${Math.max(0, input.program.source.ast.end(entry.node))}`);
    const present: CsharpExpression = selected.guard ? { kind: "IdentifierName", name } : value;
    const presentContext: CsharpPlanningContext = { ...input, scope: { ...input.scope,
      presentOptionalReceivers: new Set([...(input.scope.presentOptionalReceivers ?? []), selected.expression]),
    } };
    const expressions: ExpressionPlanner = (subject, file, context, errors, state) => {
      if (subject === selected.expression) return present;
      if (subject === entry.classification.source?.sourceCallee.expression) {
        if (input.program.source.ast.is.IsPropertyAccessExpression(subject)) {
          const property = translateCsharpPropertyAccess(subject, file, context, errors, expressions);
          return property?.kind === "ConditionalAccessExpression" ? { ...property, kind: "SimpleMemberAccessExpression" } : property;
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
    const call = planCall(entry.node, presentContext, expressions, arguments_);
    const next = call === undefined ? undefined : step(index + 1, call);
    if (next === undefined || !selected.guard) return next;
    return {
      kind: "ConditionalExpression",
      condition: { kind: "IsPatternExpression", expression: value, type, designation: name },
      whenTrue: next,
      whenFalse: absent!,
    };
  }
  const expression = step(0, receiver);
  return { handled: true, ...(expression === undefined ? {} : { expression }) };
}
