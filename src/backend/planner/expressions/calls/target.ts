import { csharpTypeFromTargetTypeRef } from "../../types/render.js";
import { renderSelectedCsharpTargetMethodTypeArguments } from "../selected-method-type-arguments.js";
import { sourceCallIsOptional, translateArrayCreationCall } from "./helpers.js";
import { translateCsharpSelectedReceiver } from "../receivers.js";
import { translateSelectedTargetArguments } from "./arguments.js";
import { failCsharpPlannerInvariant } from "../../diagnostics.js";
import type { CallArgumentPlanner, ExpressionPlanner } from "../expression-planner-types.js";
import type { CsharpArgument, CsharpExpression, CsharpTypeNode } from "../../../target-ast/syntax/index.js";
import { csharpBinaryOperatorTokenFromText, csharpPrefixUnaryOperatorTokenFromText } from "../../../target-ast/syntax/operator-tokens.js";
import type { CsharpPlanningContext } from "../../context.js";
import type { CsharpTargetCallEmission, CsharpTargetInvocationEmission } from "../../../../target-model/records/calls/target-call-emission.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpPlannedValue } from "../planned-values.js";
import { planCsharpExpressionCompletion } from "../planned-value-composition.js";
import { composeCsharpPlannedCall } from "./planned-arguments.js";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import { qualifiedCsharpType } from "../../types/index.js";

export function translateSelectedTargetCall(node: Node, sourceFile: SourceFile, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner, planCallArgument: CallArgumentPlanner): CsharpPlannedValue | undefined {
  const selected = input.program.records.targetCallEmission.get(node);
  if (selected === undefined) failCsharpPlannerInvariant("An admitted target call requires its exact native invocation plan.", node);
  const arguments_ = translateSelectedTargetArguments(node, sourceFile, input, diagnostics, planExpression, planCallArgument);
  if (arguments_ === undefined) return undefined;
  const receiver = !selected.instance || selected.source.sourceReceiver === undefined ? undefined :
    translateCsharpSelectedReceiver(selected.source.sourceReceiver, sourceFile, input, diagnostics, planExpression);
  if (selected.instance && receiver?.kind !== "value") failCsharpPlannerInvariant("An admitted instance call requires its exact native receiver acquisition.", node);
  return composeCsharpPlannedCall(node, sourceFile, input, diagnostics, receiver?.kind === "value" ? receiver.value : undefined, arguments_, (value, args) =>
    planCsharpExpressionCompletion(node, sourceFile, input, diagnostics, buildSelectedTargetCall(node, selected, args, sourceFile, input, diagnostics, value), selected.result));
}

function buildSelectedTargetCall(node: Node, selected: CsharpTargetCallEmission, arguments_: readonly CsharpArgument[],
  sourceFile: SourceFile, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[], receiver: CsharpExpression | undefined): CsharpExpression {
  const nativeType = (carrier: TargetTypeRef): CsharpTypeNode => csharpTypeFromTargetTypeRef(carrier, input.scope.typeParameterNames) ??
    failCsharpPlannerInvariant("An admitted target call requires its exact rendered native carrier.", node);
  const instance = (): CsharpExpression => receiver ?? failCsharpPlannerInvariant("An admitted instance operation requires its native receiver.", node);
  const generic = () => renderSelectedCsharpTargetMethodTypeArguments(selected.selection, node, sourceFile, input, diagnostics);
  const invocation = selected.invocation;
  switch (invocation.kind) {
    case "value-identity": return arguments_[0]!.expression;
    case "native-task-resolution": {
      const argument = arguments_[0]!.expression;
      if (invocation.form === "task") return argument;
      const owner = nativeType(invocation.owner);
      if (invocation.form === "absence") return { kind: "SwitchExpression", expression: {
        kind: "ParenthesizedExpression", expression: { kind: "CastExpression",
          type: nativeType(selected.selection.targetMember.parameters[0]!.type), expression: argument },
      },
        arms: [{ pattern: { kind: "DiscardPattern" }, expression: {
          kind: "SimpleMemberAccessExpression", receiver: owner, name: "CompletedTask",
        } }] };
      return { kind: "InvocationExpression", callee: { kind: "SimpleMemberAccessExpression", receiver: owner,
        name: "FromResult", typeArguments: [nativeType(invocation.payload)] }, arguments: arguments_ };
    }
    case "integer-truncation": return { kind: "CastExpression", type: nativeType(invocation.target), expression: {
      kind: "InvocationExpression", callee: { kind: "SimpleMemberAccessExpression",
        receiver: qualifiedCsharpType("Tsonic.CSharp.Js", "BigIntOps"), name: invocation.signed ? "AsIntNative" : "AsUintNative" },
      arguments: arguments_ } };
    case "numeric": return invocation.identity ? arguments_[0]!.expression : { kind: "CastExpression", type: nativeType(invocation.target), expression: arguments_[0]!.expression };
    case "constructor": return { kind: "ObjectCreationExpression", type: nativeType(invocation.owner), arguments: arguments_ };
    case "array": return translateArrayCreationCall(node, arguments_, input);
    case "projection": {
      const projection = invocation.projection;
      const typeArguments = projection.typeParameters.map(nativeType);
      return { kind: "InvocationExpression", callee: { kind: "SimpleMemberAccessExpression", receiver: nativeType(projection.receiver.targetType),
        name: projection.methodName, ...(typeArguments.length === 0 ? {} : { typeArguments }) }, arguments: arguments_ };
    }
    case "protocol": return planProtocolCall(node, invocation, arguments_, nativeType, input);
    case "indexer": {
      const indexer: CsharpExpression = { kind: "ElementAccessExpression", receiver: instance(), arguments: invocation.indexes.map(index => arguments_[index]!.expression) };
      return invocation.value === undefined ? indexer : { kind: "AssignmentExpression", left: indexer, operatorToken: { kind: "EqualsToken" }, right: arguments_[invocation.value]!.expression };
    }
    case "event": return { kind: "AssignmentExpression", left: { kind: "SimpleMemberAccessExpression", receiver: invocation.owner === undefined ? instance() : nativeType(invocation.owner),
      name: invocation.name }, operatorToken: { kind: invocation.add ? "PlusEqualsToken" : "MinusEqualsToken" }, right: arguments_[0]!.expression };
    case "operator": {
      let expression: CsharpExpression;
      if (invocation.form === "prefix") {
        const token = csharpPrefixUnaryOperatorTokenFromText(invocation.operator);
        if (token === undefined) failCsharpPlannerInvariant("An admitted native prefix operator requires its selected syntax token.", node);
        expression = { kind: "PrefixUnaryExpression", operatorToken: token, operand: arguments_[invocation.operands[0]!]!.expression };
      } else {
        const token = csharpBinaryOperatorTokenFromText(invocation.operator);
        if (token === undefined) failCsharpPlannerInvariant("An admitted native binary operator requires its selected syntax token.", node);
        expression = { kind: "BinaryExpression", operatorToken: token, left: arguments_[invocation.operands[0]!]!.expression, right: arguments_[invocation.operands[1]!]!.expression };
      }
      return invocation.checked ? { kind: "CheckedExpression", expression } : expression;
    }
    case "static-member": {
      const access: CsharpExpression = { kind: "SimpleMemberAccessExpression", receiver: nativeType(invocation.owner), name: invocation.name };
      if (invocation.operation === "property-get") return access;
      if (invocation.operation !== "call") return { kind: "AssignmentExpression", left: access,
        operatorToken: { kind: invocation.operation === "event-add" ? "PlusEqualsToken" : invocation.operation === "event-remove" ? "MinusEqualsToken" : "EqualsToken" }, right: arguments_[0]!.expression };
      const typeArguments = generic();
      return { kind: "InvocationExpression", callee: { ...access, ...(typeArguments.length === 0 ? {} : { typeArguments }) }, arguments: arguments_ };
    }
    case "method": {
      const typeArguments = generic();
      return { kind: "InvocationExpression", callee: { kind: selected.instance && sourceCallIsOptional(input, node) ? "ConditionalAccessExpression" : "SimpleMemberAccessExpression",
        receiver: invocation.owner === undefined ? instance() : nativeType(invocation.owner), name: invocation.name,
        ...(typeArguments.length === 0 ? {} : { typeArguments }) }, arguments: arguments_ };
    }
  }
}

function planProtocolCall(node: Node, selected: Extract<CsharpTargetInvocationEmission, { readonly kind: "protocol" }>, arguments_: readonly CsharpArgument[],
  nativeType: (carrier: TargetTypeRef) => CsharpTypeNode, input: CsharpPlanningContext): CsharpExpression {
  const protocol = "__tsonic_protocol";
  const source = "__tsonic_input";
  const forwarded = Array.from({ length: selected.forwarded }, (_, index) => `__tsonic_protocolArgument${index}`);
  const lambda: CsharpExpression = { kind: "LambdaExpression", parameters: [protocol, source, ...forwarded].map(name => ({ kind: "Parameter", name })),
    body: { kind: "InvocationExpression", callee: { kind: "SimpleMemberAccessExpression", receiver: { kind: "IdentifierName", name: protocol }, name: selected.method },
      arguments: [source, ...forwarded].map(name => ({ kind: "Argument", expression: { kind: "IdentifierName", name } })) } };
  const invocation: Extract<CsharpExpression, { readonly kind: "InvocationExpression" }> = { kind: "InvocationExpression", callee: {
    kind: "SimpleMemberAccessExpression", receiver: nativeType(selected.owner), name: selected.name, typeArguments: selected.types.map(nativeType) },
    arguments: [...arguments_, { kind: "Argument", expression: lambda }] };
  if (!sourceCallIsOptional(input, node)) return invocation;
  const lifted = selected.lifted;
  if (lifted === undefined) failCsharpPlannerInvariant("An admitted optional protocol dispatch requires its exact lifted result.", node);
  const name = input.names.temporaryName(`__tsonic_protocolReceiver_${input.program.source.ast.pos(node)}`);
  return { kind: "ConditionalExpression", condition: { kind: "IsPatternExpression", expression: arguments_[0]!.expression, type: nativeType(selected.receiver), designation: name },
    whenTrue: { ...invocation, arguments: [{ kind: "Argument", expression: { kind: "IdentifierName", name } }, ...invocation.arguments.slice(1)] },
    whenFalse: { kind: "DefaultExpression", type: nativeType(lifted) } };
}
