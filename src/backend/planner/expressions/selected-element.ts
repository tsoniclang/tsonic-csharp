import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpElementRead } from "../../../target-model/records/element-admission.js";
import type { CsharpArgument, CsharpExpression } from "../../target-ast/syntax/index.js";
import type { CsharpPlanningContext } from "../context.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";
import type { CallArgumentPlanner, ExpressionPlanner } from "./expression-planner-types.js";
import { csharpTypeFromTargetTypeRef } from "../types/render.js";
import { translateCsharpJsValueInvocation } from "./js-value-operations.js";
import { applyCsharpConversionSelection } from "./conversions.js";
import { translateCsharpSelectedReceiver } from "./receivers.js";
import { csharpRecordOptionalRead } from "../objects/indexed-records.js";
import type { CsharpPlannedValue } from "./planned-values.js";
import { composeCsharpPlannedValues, planCsharpOptionalReceiverValue,
  projectCsharpPlannedMember, planCsharpExpressionCompletion } from "./planned-value-composition.js";
import { csharpPlannedValue } from "./planned-values.js";
import { planCsharpDiscardedOperand } from "../statements/statement-output.js";
import { translateCsharpSourceOwnedMember } from "./source-owned-members.js";
import { planCsharpCollectionElementRead } from "./collection-reads.js";
import { captureCsharpPlannedMemberReceiver } from "./planned-locations.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";

export function translateCsharpElementAccess(node: Node, sourceFile: SourceFile, input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[], planExpression: ExpressionPlanner, planCallArgument: CallArgumentPlanner): CsharpPlannedValue | undefined {
  const selected = input.program.records.selectedElement.get(node)?.emission;
  if (selected === undefined) failCsharpPlannerInvariant("An admitted element access requires its sealed native emission plan.", node);
  if (selected.kind === "js-value") {
    const receiver = planExpression(selected.receiver, sourceFile, input, diagnostics);
    const key = planExpression(selected.key, sourceFile, input, diagnostics);
    return planElementOperands(node, sourceFile, input, diagnostics, receiver, key, selected.optional &&
      input.scope.presentOptionalValues?.has(selected.receiver) !== true,
      (target, key) => translateCsharpJsValueInvocation(input.scope.typeParameterNames, selected.operation, target, [key]), selected.result);
  }
  const optional = selected.optional && input.scope.presentOptionalValues?.has(selected.receiver.expression) !== true;
  const receiver = translateCsharpSelectedReceiver(selected.receiver, sourceFile, input, diagnostics, planExpression, selected.projection);
  if (receiver === undefined) return undefined;
  if (selected.kind === "tuple") {
    if (receiver.kind !== "value") failCsharpPlannerInvariant("An admitted tuple element requires a native receiver value.", node);
    return projectCsharpPlannedMember(node, sourceFile, input, diagnostics, receiver.value, selected.member, optional);
  }
  const argument = selected.kind !== "access" || selected.indexType === undefined
    ? planExpression(selected.key, sourceFile, input, diagnostics)
    : planCallArgument(selected.key, sourceFile, input, diagnostics, selected.indexType, "by-value");
  if (selected.kind === "source-member") {
    if (selected.static) return composeCsharpPlannedValues(node, sourceFile, input, diagnostics,
      [planCsharpDiscardedOperand(argument)], () => translateCsharpSourceOwnedMember(node, sourceFile, input, diagnostics, receiver, false));
    if (receiver.kind !== "value") failCsharpPlannerInvariant("An admitted instance element requires a native receiver value.", node);
    const access = (target: CsharpPlannedValue): CsharpPlannedValue | undefined => composeCsharpPlannedValues(node, sourceFile, input, diagnostics,
      [target, planCsharpDiscardedOperand(argument)], values => translateCsharpSourceOwnedMember(node, sourceFile, input, diagnostics,
        { kind: "value", value: { ...csharpPlannedValue(target.completion.carrier, values[0]!), address:
          values[0] === (target.completion.kind === "value" ? target.completion.expression : undefined) ? target.address : { kind: "root" } } }, false),
      (carrier, operand) => captureCsharpPlannedMemberReceiver(node, sourceFile, input, diagnostics, selected.receiver.expression,
        carrier, operand, selected.suspends, selected.writable));
    return optional ? planCsharpOptionalReceiverValue(node, sourceFile, input, diagnostics, receiver.value,
      present => access(csharpPlannedValue(selected.present, present))) : access(receiver.value);
  }
  if (receiver.kind !== "value") failCsharpPlannerInvariant("An admitted native indexer requires a native receiver value.", node);
  return planElementOperands(node, sourceFile, input, diagnostics, receiver.value, argument, optional, (target, key) => {
    const value = planElementRead(node, selected.read, target, key, sourceFile, input, diagnostics);
    const conversion = selected.conversion;
    return value === undefined || conversion === undefined ? value : applyCsharpConversionSelection(node, sourceFile, input, diagnostics,
      conversion.source, conversion.target, conversion.conversion, value);
  }, selected.result, selected.read.kind === "index");
}

function planElementRead(node: Node, selected: CsharpElementRead, receiver: CsharpExpression, key: CsharpExpression,
  sourceFile: SourceFile, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[]): CsharpExpression | undefined {
  switch (selected.kind) {
    case "index": return { kind: "ElementAccessExpression", receiver, arguments: [key] };
    case "record-optional": return csharpRecordOptionalRead(node, receiver, key,
      `__tsonic_record_${input.program.source.ast.pos(node)}_${input.program.source.ast.end(node)}`, input);
    case "collection": return planCsharpCollectionElementRead(selected.carrier, receiver, key, input);
    case "method": {
      const arguments_: CsharpArgument[] = [{ kind: "Argument", expression: key }];
      if (selected.append !== undefined) arguments_.push({ kind: "Argument", expression: { kind: "LiteralExpression", value: selected.append } });
      return { kind: "InvocationExpression", callee: { kind: "SimpleMemberAccessExpression", receiver, name: selected.name }, arguments: arguments_ };
    }
    case "array-like": {
      const owner = csharpTypeFromTargetTypeRef(selected.owner, input.scope.typeParameterNames);
      if (owner === undefined) failCsharpPlannerInvariant("An admitted array-like index requires its exact native target owner.", node);
      const projection = selected.projection;
      const value = applyCsharpConversionSelection(node, sourceFile, input, diagnostics,
        projection.source, projection.target, projection.conversion, receiver);
      return value === undefined ? undefined : { kind: "InvocationExpression",
        callee: { kind: "SimpleMemberAccessExpression", receiver: owner, name: selected.name },
        arguments: [{ kind: "Argument", expression: value }, { kind: "Argument", expression: key }] };
    }
  }
}

function planElementOperands(node: Node, sourceFile: SourceFile, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[],
  receiver: CsharpPlannedValue | undefined, argument: CsharpPlannedValue | undefined, optional: boolean,
  build: (receiver: CsharpExpression, argument: CsharpExpression) => CsharpExpression | undefined, carrier: TargetTypeRef,
  nativeIndex = false): CsharpPlannedValue | undefined {
  const complete = (target: CsharpExpression, key: CsharpExpression): CsharpPlannedValue | undefined => {
    const planned = planCsharpExpressionCompletion(node, sourceFile, input, diagnostics, build(target, key), carrier);
    return planned === undefined || !nativeIndex ? planned : { ...planned,
      address: { kind: "element", receiver: { expression: target }, arguments: [key] } };
  };
  return optional ? planCsharpOptionalReceiverValue(node, sourceFile, input, diagnostics, receiver, present =>
    composeCsharpPlannedValues(node, sourceFile, input, diagnostics, [argument], values => complete(present, values[0]!)), carrier)
    : composeCsharpPlannedValues(node, sourceFile, input, diagnostics, [receiver, argument], values => complete(values[0]!, values[1]!));
}
