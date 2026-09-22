import { applyCalleeTypeArguments, isProjectSourceDeclaration, sourceCalleeRequiresExactTargetArity } from "./helpers.js";
import { planCsharpUnionDispatcherCall } from "./union.js";
import { planCsharpSourceUndefinedValue } from "../../undefined-values.js";
import { translateCallArgument } from "./arguments.js";
import { unsupportedNodeDiagnostic } from "../../../diagnostics.js";
import type { CallArgumentPlanner, ExpressionPlanner } from "../../expression-planner-types.js";
import type { CsharpArgument, CsharpExpression } from "../../../../target-ast/roslyn/index.js";
import type { CsharpPlanningContext } from "../../../context.js";
import type { CsharpTargetParameter } from "../../../../../target-model/types/index.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { ResolvedSourceCallInfo } from "../../../../../analysis/operations/index.js";
import type { CsharpCallClassification } from "../../../../../analysis/operations/index.js";
import type { CsharpSourceCallArgumentClassification } from "../../../../../analysis/operations/index.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import { csharpSourceArgumentGroups } from "./source-argument-groups.js";

export function translateSourceOwnedCall(
  node: Node,
  source: ResolvedSourceCallInfo,
  classification: CsharpCallClassification,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  planCallArgument: CallArgumentPlanner,
): CsharpExpression | undefined {
  const signatureDeclaration = input.program.sourceEvidence.signatureDeclaration(
    source.selectedSignature,
  );
  if (
    !isProjectSourceDeclaration(
      input,
      source.sourceCallee.selectedDeclaration,
    ) &&
    !isProjectSourceDeclaration(input, signatureDeclaration)
  ) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "The exact selected source callee is external to the project and has no C# target relation.",
    ));
    return undefined;
  }
  if (classification.unionCall.kind === "rejected") {
    diagnostics.push(unsupportedNodeDiagnostic(node, classification.unionCall.reason));
    return undefined;
  }
  if (classification.unionCall.kind === "resolved") {
    const union = classification.unionCall;
    const receiver = planExpression(union.receiver, sourceFile, input, diagnostics);
    const arguments_ = translateSourceOwnedArguments(node, source, classification, sourceFile, input, diagnostics, planExpression, planCallArgument);
    return receiver === undefined || arguments_ === undefined ? undefined
      : planCsharpUnionDispatcherCall(node, source, classification, receiver, arguments_, input, diagnostics);
  }
  let callee = planExpression(
    source.sourceCallee.expression,
    sourceFile,
    input,
    diagnostics,
  );
  if (callee === undefined) {
    return undefined;
  }
  if (classification.sourceMethodValue !== undefined) {
    callee = { kind: "SimpleMemberAccessExpression", receiver: callee, name: classification.sourceMethodValue.method };
  }
  const typeArguments = classification.sourceTypeArguments;
  if (typeArguments === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "Source-owned generic call has a selected method type argument with no closed C# representation.",
    ));
    return undefined;
  }
  callee = applyCalleeTypeArguments(
    callee,
    typeArguments,
    node,
    diagnostics,
  );
  if (callee === undefined) {
    return undefined;
  }
  const arguments_ = translateSourceOwnedArguments(
    node,
    source,
    classification,
    sourceFile,
    input,
    diagnostics,
    planExpression,
    planCallArgument,
  );
  return arguments_ === undefined
    ? undefined
    : { kind: "InvocationExpression", callee, arguments: arguments_ };
}

export function translateSourceOwnedArguments(
  node: Node,
  source: ResolvedSourceCallInfo,
  classification: CsharpSourceCallArgumentClassification,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  planCallArgument: CallArgumentPlanner,
): readonly CsharpArgument[] | undefined {
  const exactTargetArity = classification.sourceMethodValue === undefined && sourceCalleeRequiresExactTargetArity(source, input);
  const nativeParameters = classification.sourceNativeParameters;
  const groups = csharpSourceArgumentGroups(source, classification, exactTargetArity);
  if (nativeParameters === undefined || groups === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Source-owned arguments have no exact native parameter grouping."));
    return undefined;
  }
  const restIndex = nativeParameters.findIndex(parameter => parameter.paramsArray === true);
  const bindingsBySourceArgument = new Map<
    number,
    ResolvedSourceCallInfo["sourceArgumentBindings"]
  >();
  for (const binding of source.sourceArgumentBindings) {
    const existing = bindingsBySourceArgument.get(binding.sourceArgumentIndex) ??
      [];
    bindingsBySourceArgument.set(
      binding.sourceArgumentIndex,
      [...existing, binding],
    );
  }
  const planned: CsharpArgument[] = [];
  for (
    let sourceArgumentIndex = 0;
    sourceArgumentIndex < source.sourceArguments.length;
    sourceArgumentIndex += 1
  ) {
    const argument = source.sourceArguments[sourceArgumentIndex]?.expression;
    const bindings = bindingsBySourceArgument.get(sourceArgumentIndex) ?? [];
    if (argument === undefined || bindings.length === 0) {
      diagnostics.push(unsupportedNodeDiagnostic(
        node,
        `Source-owned call argument ${sourceArgumentIndex} has no exact selected parameter binding.`,
      ));
      return undefined;
    }
    const first = bindings[0]!;
    if (
      bindings.some((binding) =>
        binding.sourceParameterIndex !== first.sourceParameterIndex ||
        binding.sourceForm !== first.sourceForm)
    ) {
      diagnostics.push(unsupportedNodeDiagnostic(
        node,
        "Source-owned tuple-spread arguments require an explicit expansion plan.",
      ));
      return undefined;
    }
    const parameterIndex = restIndex < 0 ? first.effectiveArgumentIndex : Math.min(first.effectiveArgumentIndex, restIndex);
    const parameter = nativeParameters[parameterIndex];
    const bindingIndex = source.sourceArgumentBindings.indexOf(first);
    const targetType = bindingIndex < 0
      ? undefined
      : classification.sourceArgumentParameterTypes?.[bindingIndex];
    if (parameter === undefined || targetType === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(
        node,
        `Source-owned selected parameter ${first.sourceParameterIndex} has no closed C# type.`,
      ));
      return undefined;
    }
    const targetParameter: CsharpTargetParameter = {
      name: parameter.name,
      type: targetType,
      passingMode: "by-value",
      ...(parameter.optional === true ? { optional: true } : {}),
      ...(parameter.paramsArray === true && first.sourceForm === "spread-sequence" ? { paramsArray: true } : {}),
    };
    const value = first.sourceForm === "spread-sequence"
      ? input.program.source.ast.as.AsSpreadElement(argument)?.Expression : argument;
    if (value === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(argument, "A selected sequence spread has no exact source operand."));
      return undefined;
    }
    const plannedArgument = translateCallArgument(
      value,
      targetParameter,
      first.sourceForm,
      sourceFile,
      input,
      diagnostics,
      planExpression,
      planCallArgument,
    );
    if (plannedArgument === undefined) {
      return undefined;
    }
    planned.push(plannedArgument);
  }
  const arguments_: CsharpArgument[] = [];
  for (const group of groups) {
    if (group.collect) {
      arguments_.push({ kind: "Argument", expression: { kind: "CollectionExpression", elements: group.arguments.map(argument => ({
        kind: argument.spread ? "SpreadElement" : "ExpressionElement", expression: planned[argument.index]!.expression,
      })) } });
      continue;
    }
    const argument = group.arguments[0];
    if (argument !== undefined) {
      arguments_.push(planned[argument.index]!);
      continue;
    }
    const parameter = source.sourceSelectedSignatureParameters[group.parameterIndex];
    const declaration = parameter === undefined ? undefined
      : input.program.source.ast.as.AsParameterDeclaration(parameter.parameterDeclaration);
    if (declaration?.Initializer !== undefined && parameter?.parameterDeclaration !== undefined &&
      input.program.declarations.referenceDefault(parameter.parameterDeclaration) === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(node,
        `Omitted source-owned delegate parameter ${group.parameterIndex} has a default initializer that requires exact callee-side default evaluation before C# emission.`));
      return undefined;
    }
    const omitted = planCsharpSourceUndefinedValue(
      node,
      group.type,
      sourceFile,
      input,
      diagnostics,
    );
    if (omitted.kind !== "resolved") {
      diagnostics.push(unsupportedNodeDiagnostic(
        node,
        `Omitted source-owned selected parameter ${group.parameterIndex} has no exact C# representation for source undefined.`,
      ));
      return undefined;
    }
    arguments_.push({ kind: "Argument", expression: omitted.expression });
  }
  return arguments_;
}
