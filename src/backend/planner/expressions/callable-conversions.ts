import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpConversionSelection } from "../../../target-model/conversions/selection.js";
import type { CsharpDelegateContract } from "../../../target-model/records/callables/callable-conversions.js";
import type { CsharpArgument, CsharpExpression, CsharpStatement, CsharpTypeNode } from "../../target-ast/syntax/index.js";
import type { CsharpPlanningContext } from "../context.js";
import type { CsharpPlannedCallable } from "./planned-values.js";
import type { applyCsharpConversionSelection } from "./conversions.js";
import { csharpTypeFromTargetTypeRef } from "../types/render.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";
import { planCsharpVoidReturn } from "../statements/statement-output.js";
import { planCsharpExpressionCompletion } from "./planned-value-composition.js";
import { getCsharpMethodValue } from "../../../target-model/types/method-values.js";

interface RenderedDelegateContract extends CsharpDelegateContract {
  readonly sourceType: TargetTypeRef;
  readonly sourceDelegateType: CsharpTypeNode;
  readonly targetDelegateType: CsharpTypeNode;
}

type DelegateSelection = Extract<CsharpConversionSelection, { readonly kind: "delegate-adapter" }>;
type DelegateLambda = Extract<CsharpExpression, { readonly kind: "LambdaExpression" }>;

export function planCsharpDelegateAdapter(node: Node, sourceFile: SourceFile, input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[], sourceType: TargetTypeRef | undefined, targetType: TargetTypeRef | undefined,
  selection: DelegateSelection, expression: CsharpExpression, convert: typeof applyCsharpConversionSelection,
  operand?: CsharpPlannedCallable): CsharpExpression | undefined {
  const contract = requiredContract(node, input, sourceType, targetType);
  const method = getCsharpMethodValue(contract.sourceType)?.method;
  if (selection.strategy === "native-binding") {
    if (operand?.kind === "lambda") return operand.expression;
    return { kind: "ObjectCreationExpression", type: contract.targetDelegateType, arguments: [{ kind: "Argument",
      expression: operand?.kind === "method" || operand?.kind === "captured-method" ? expression
        : { kind: "SimpleMemberAccessExpression", receiver: expression, name: method ?? "Invoke" },
    }] };
  }
  const identity = input.scope.delegateAdapters === undefined ? undefined : input.program.records.delegateAdapter.get(node, contract.sourceType, targetType!);
  if (identity !== undefined) {
    const name = input.scope.delegateAdapters?.get(identity)
      ?? failCsharpPlannerInvariant("An admitted retained adapter requires its exact lexical native method.", node);
    return { kind: "ObjectCreationExpression", type: contract.targetDelegateType,
      arguments: [{ kind: "Argument", expression: { kind: "IdentifierName", name } }] };
  }
  const name = input.names.temporaryName("__tsonic_callable");
  const direct = operand?.kind === "method" || operand?.kind === "stable-value" || operand?.kind === "lambda";
  const callee: CsharpExpression = operand?.kind === "lambda" ? { kind: "IdentifierName", name }
    : operand?.kind === "method" ? expression
    : operand?.kind === "stable-value" ? method === undefined ? expression : { kind: "SimpleMemberAccessExpression", receiver: expression, name: method }
    : operand?.kind === "captured-method" ? { kind: "SimpleMemberAccessExpression", receiver: { kind: "IdentifierName", name }, name: operand.name }
    : method === undefined ? { kind: "IdentifierName", name }
    : { kind: "SimpleMemberAccessExpression", receiver: { kind: "IdentifierName", name }, name: method };
  const adapter = buildAdaptation(node, sourceFile, input, diagnostics, selection, contract, callee, convert,
    operand?.kind === "lambda" ? { name, expression: operand.expression } : undefined);
  if (adapter === undefined || direct) return adapter;
  return { kind: "SwitchExpression", expression: operand?.kind === "captured-method" ? operand.receiver
    : { kind: "CastExpression", type: contract.sourceDelegateType, expression }, arms: [{ pattern: { kind: "VarPattern", designation: name },
      expression: { kind: "CastExpression", type: contract.targetDelegateType, expression: adapter } }] };
}

export function planCsharpDelegateAdaptationBody(node: Node, sourceFile: SourceFile, input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[], sourceType: TargetTypeRef, targetType: TargetTypeRef, selection: DelegateSelection,
  callee: CsharpExpression, convert: typeof applyCsharpConversionSelection): DelegateLambda | undefined {
  if (selection.strategy !== "adaptation") failCsharpPlannerInvariant("An admitted retained delegate method requires its selected adaptation strategy.", node);
  const contract = requiredContract(node, input, sourceType, targetType);
  const method = getCsharpMethodValue(contract.sourceType)?.method;
  return buildAdaptation(node, sourceFile, input, diagnostics, selection, contract, method === undefined ? callee
    : { kind: "SimpleMemberAccessExpression", receiver: callee, name: method }, convert);
}

function buildAdaptation(node: Node, sourceFile: SourceFile, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[],
  selection: DelegateSelection, contract: RenderedDelegateContract, callee: CsharpExpression,
  convert: typeof applyCsharpConversionSelection, local?: { readonly name: string; readonly expression: DelegateLambda }): DelegateLambda | undefined {
  const { sourceSignature, targetSignature } = contract;
  const type = (carrier: TargetTypeRef): CsharpTypeNode => csharpTypeFromTargetTypeRef(carrier, input.scope.typeParameterNames)
    ?? failCsharpPlannerInvariant("An admitted delegate adapter requires its exact rendered native signature.", node);
  const parameters = targetSignature.parameters.map((carrier, index) => ({ kind: "Parameter" as const, name: input.names.temporaryName(`__tsonic_arg${index}`), type: type(carrier) }));
  const statements: CsharpStatement[] = [];
  if (local !== undefined) {
    const sourceParameters = local.expression.parameters.map((parameter, index) => ({ ...parameter,
      type: parameter.type ?? type(sourceSignature.parameters[index]
        ?? failCsharpPlannerInvariant("An admitted adapted lambda requires its exact native parameter vector.", node)) }));
    statements.push({ kind: "LocalFunctionStatement", name: local.name, returnType: type(sourceSignature.returnType),
      modifiers: local.expression.async ? ["async"] : [], parameters: sourceParameters,
      body: local.expression.body.kind === "Block" ? local.expression.body : { kind: "Block", statements: [contract.sourceVoid
        ? { kind: "ExpressionStatement", expression: local.expression.body } : { kind: "ReturnStatement", expression: local.expression.body }] } });
  }
  const arguments_: CsharpArgument[] = [];
  for (const [index, carrier] of sourceSignature.parameters.entries()) {
    const converted = convert(node, sourceFile, input, diagnostics, targetSignature.parameters[index], carrier,
      selection.parameterConversions[index]!, { kind: "IdentifierName", name: parameters[index]!.name });
    if (converted === undefined) return undefined;
    arguments_.push({ kind: "Argument", expression: converted });
  }
  const invocation: CsharpExpression = { kind: "InvocationExpression", callee, arguments: arguments_ };
  if (selection.returnConversion.kind === "void-return") {
    const completion = planCsharpExpressionCompletion(node, sourceFile, input, diagnostics, invocation, sourceSignature.returnType);
    if (completion === undefined) return undefined;
    statements.push(...planCsharpVoidReturn(completion, contract.targetVoid ? "void" : "absence", targetSignature.returnType, input));
  } else {
    const value = convert(node, sourceFile, input, diagnostics, sourceSignature.returnType, targetSignature.returnType, selection.returnConversion, invocation);
    if (value === undefined) return undefined;
    statements.push(contract.targetVoid ? { kind: "ExpressionStatement", expression: value } : { kind: "ReturnStatement", expression: value });
  }
  return { kind: "LambdaExpression", parameters, body: { kind: "Block", statements } };
}

function requiredContract(node: Node, input: CsharpPlanningContext, source: TargetTypeRef | undefined, target: TargetTypeRef | undefined): RenderedDelegateContract {
  if (source === undefined || target === undefined) failCsharpPlannerInvariant("An admitted delegate conversion requires its exact native source and target.", node);
  const contract = input.program.records.delegateContract.get(source, target)
    ?? failCsharpPlannerInvariant("An admitted delegate conversion requires its sealed physical signature contract.", node);
  const sourceDelegateType = csharpTypeFromTargetTypeRef(source, input.scope.typeParameterNames);
  const targetDelegateType = csharpTypeFromTargetTypeRef(contract.targetCarrier, input.scope.typeParameterNames);
  if (sourceDelegateType === undefined || targetDelegateType === undefined)
    failCsharpPlannerInvariant("An admitted delegate conversion requires its exact rendered native carriers.", node);
  return { ...contract, sourceType: source, sourceDelegateType, targetDelegateType };
}
