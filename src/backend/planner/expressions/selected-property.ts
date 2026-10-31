import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpTargetPropertySelection } from "../../../target-model/records/operations/member-selections.js";
import type {
  CsharpExpression,
} from "../../target-ast/syntax/index.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";
import type {
  ExpressionPlanner,
} from "./expression-planner-types.js";
import { csharpTypeFromTargetTypeRef } from "../types/render.js";
import type {
  CsharpPlanningContext,
} from "../context.js";
import {
  translateCsharpSelectedReceiver,
} from "./receivers.js";
import { applyCsharpConversionSelection, readCsharpExpressionOperandStability } from "./conversions.js";
import { csharpRecordOptionalRead } from "../objects/indexed-records.js";
import { planCsharpUnionProperty } from "./union-properties.js";
import { mapCsharpPlannedValue, type CsharpPlannedValue } from "./planned-values.js";
import { planCsharpExpressionCompletion, projectCsharpPlannedValue, projectCsharpPlannedMember } from "./planned-value-composition.js";
import { csharpPlannedAddressOperand } from "./planned-locations.js";
import { readCsharpNativeExpressionCarrier } from "./native-uses.js";
import { translateCsharpSourceOwnedMember } from "./source-owned-members.js";
import { planCsharpReceiverCallProperty } from "./receiver-call-property.js";

export function translateCsharpPropertyAccess(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpPlannedValue | undefined {
  const classification = input.program.records.selectedProperty.get(node);
  if (classification === undefined) {
    failCsharpPlannerInvariant("An admitted property access requires its sealed target classification.", node);
  }
  const selection = classification.selection;
  switch (selection.kind) {
    case "union-property":
      return planCsharpUnionProperty(node, selection, sourceFile, input, diagnostics, planExpression);
    case "resolved":
      return translateSelectedProperty(
        node,
        selection,
        sourceFile,
        input,
        diagnostics,
        planExpression,
      );
    case "source-owned": {
      const receiver = translateCsharpSelectedReceiver(selection.source.receiver, sourceFile, input,
        diagnostics, planExpression, classification.receiverProjection);
      return receiver === undefined ? undefined : translateCsharpSourceOwnedMember(node,
        sourceFile, input, diagnostics, receiver, selection.source.optionalChain &&
          input.scope.presentOptionalValues?.has(selection.source.receiver.expression) !== true);
    }
  }
}

function translateSelectedProperty(
  node: Node,
  selection: Extract<
    CsharpTargetPropertySelection,
    { readonly kind: "resolved" }
  >,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpPlannedValue | undefined {
  const member = selection.targetMember;
  const conditional = selection.source.optionalChain && input.scope.presentOptionalValues?.has(selection.source.receiver.expression) !== true;
  if (selection.invocation.kind === "receiver-call") {
    return planCsharpReceiverCallProperty(node, selection, sourceFile, input, diagnostics, planExpression);
  }
  if (selection.invocation.kind === "source-name-indexer") {
    const sourceName = input.program.records.sourceNameIndexer.get(node);
    if (sourceName === undefined) failCsharpPlannerInvariant("An admitted source-name indexer requires its exact authored key.", node);
    const receiver = translateCsharpSelectedReceiver(
      selection.source.receiver,
      sourceFile,
      input,
      diagnostics,
      planExpression,
      input.program.records.selectedProperty.get(node)?.receiverProjection,
    );
    if (receiver === undefined) {
      return undefined;
    }
    if (receiver.kind !== "value") failCsharpPlannerInvariant("An admitted source-name indexer requires a native receiver value.", node);
    const key: CsharpExpression = { kind: "LiteralExpression", value: sourceName };
    if (selection.invocation.optionalRead) {
      return projectCsharpPlannedValue(node, sourceFile, input, diagnostics, receiver.value, value => csharpRecordOptionalRead(node, value, key,
        `__tsonic_record_${input.program.source.ast.pos(node)}_${input.program.source.ast.end(node)}`, input));
    }
    const planned = projectCsharpPlannedValue(node, sourceFile, input, diagnostics, receiver.value, value => ({
      kind: conditional
        ? "ConditionalElementAccessExpression"
        : "ElementAccessExpression",
      receiver: value,
      arguments: [key],
    }));
    return planned === undefined || receiver.value.completion.kind !== "value" ? planned : { ...planned,
      address: { kind: "element", receiver: csharpPlannedAddressOperand(receiver.value), arguments: [key] } };
  }
  if (selection.receiver.kind === "none") {
    const receiver = targetStaticReceiver(input.scope.typeParameterNames, member, node);
    const planned = receiver === undefined ? undefined : planCsharpExpressionCompletion(node, sourceFile, input, diagnostics,
      { kind: "SimpleMemberAccessExpression", receiver, name: member.targetName }, readCsharpNativeExpressionCarrier(input, node));
    return planned === undefined ? undefined : { ...planned, address: { kind: "root" } };
  }
  const receiver = translateCsharpSelectedReceiver(
        selection.source.receiver,
        sourceFile,
        input,
        diagnostics,
        planExpression,
        input.program.records.selectedProperty.get(node)?.receiverProjection,
      );
  if (receiver === undefined) {
    return undefined;
  }
  if (receiver.kind !== "value") failCsharpPlannerInvariant("An admitted instance property requires a native receiver value.", node);
  const projection = selection.invocation.kind === "array-like" ? selection.invocation.projection : undefined;
  const projected = projection === undefined ? receiver.value : mapCsharpPlannedValue(receiver.value, projection.target,
    (value, prelude) => applyCsharpConversionSelection(node, sourceFile, input, diagnostics, projection.source, projection.target, projection.conversion, value, prelude, readCsharpExpressionOperandStability(node, input, projection.source, projection.target, "implicit", projection.conversion)));
  return projected === undefined ? undefined : projectCsharpPlannedMember(node, sourceFile, input, diagnostics,
    projected, member.targetName, conditional);
}

function targetStaticReceiver(
  typeParameterNames: ReadonlyMap<string, string> | undefined,
  member: Extract<
    CsharpTargetPropertySelection,
    { readonly kind: "resolved" }
  >["targetMember"],
  node: Node,
): CsharpExpression | undefined {
  const declaringType = member.declaringType;
  if (declaringType === undefined) {
    failCsharpPlannerInvariant("An admitted static target property requires its declaring type.", node);
  }
  const receiver = csharpTypeFromTargetTypeRef(declaringType, typeParameterNames);
  if (receiver === undefined) {
    failCsharpPlannerInvariant("An admitted static target property requires its renderable declaring type.", node);
  }
  return receiver;
}
