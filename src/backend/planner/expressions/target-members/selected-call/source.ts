import { applyCalleeTypeArguments, isProjectSourceDeclaration, sourceCalleeRequiresExactTargetArity, targetDelegatePreservesOmission } from "./helpers.js";
import { planCsharpSourceUndefinedValue } from "../../undefined-values.js";
import { translateCallArgument } from "./arguments.js";
import { unsupportedNodeDiagnostic } from "../../../diagnostics.js";
import type { CallArgumentPlanner, ExpressionPlanner } from "../../expression-planner-types.js";
import type { CsharpArgument, CsharpExpression } from "../../../../roslyn/syntax.js";
import type { CsharpPlanningContext } from "../../../context.js";
import type { CsharpTargetParameter } from "../../../../../policy/types/index.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { ResolvedSourceCallInfo } from "../../../../../policy/members/index.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";

export function translateSourceOwnedCall(
  node: Node,
  source: ResolvedSourceCallInfo,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  planCallArgument: CallArgumentPlanner,
): CsharpExpression | undefined {
  const signatureDeclaration = input.semantics(sourceFile)
    .getSignatureDeclaration(source.selectedSignature);
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
  let callee = planExpression(
    source.sourceCallee.expression,
    sourceFile,
    input,
    diagnostics,
  );
  if (callee === undefined) {
    return undefined;
  }
  const typeArguments = input.types.resolveSourceCallTypeArguments(
    source,
    sourceFile,
  );
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
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  planCallArgument: CallArgumentPlanner,
): readonly CsharpArgument[] | undefined {
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
    const parameter = source.sourceSelectedSignatureParameters[
      first.sourceParameterIndex
    ];
    const targetType = input.types.resolveSourceCallArgumentParameter(
      source,
      first,
      sourceFile,
    );
    if (parameter === undefined || targetType === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(
        node,
        `Source-owned selected parameter ${first.sourceParameterIndex} has no closed C# type.`,
      ));
      return undefined;
    }
    const targetParameter: CsharpTargetParameter = {
      name: parameter.parameterName,
      type: targetType,
      passingMode: "by-value",
      ...(parameter.acceptsOmission ? { optional: true } : {}),
      ...(parameter.rest ? { paramsArray: true } : {}),
    };
    const plannedArgument = translateCallArgument(
      argument,
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
  const boundParameterIndexes = new Set(
    source.sourceArgumentBindings.map((binding) => binding.sourceParameterIndex),
  );
  for (
    let parameterIndex = 0;
    parameterIndex < source.sourceSelectedSignatureParameters.length;
    parameterIndex += 1
  ) {
    if (boundParameterIndexes.has(parameterIndex)) {
      continue;
    }
    const parameter = source.sourceSelectedSignatureParameters[parameterIndex];
    if (parameter === undefined || parameter.rest) {
      continue;
    }
    if (!parameter.acceptsOmission) {
      diagnostics.push(unsupportedNodeDiagnostic(
        node,
        `Source-owned selected parameter ${parameterIndex} has no exact source argument and does not accept omission.`,
      ));
      return undefined;
    }
    const exactTargetArity = sourceCalleeRequiresExactTargetArity(
      source,
      input,
    );
    if (
      !exactTargetArity ||
      targetDelegatePreservesOmission(
        source,
        parameterIndex,
        sourceFile,
        input,
      )
    ) {
      continue;
    }
    const declaration = input.ast.as.AsParameterDeclaration(
      parameter.parameterDeclaration,
    );
    if (declaration?.Initializer !== undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(
        node,
        `Omitted source-owned delegate parameter ${parameterIndex} has a default initializer that requires exact callee-side default evaluation before C# emission.`,
      ));
      return undefined;
    }
    const targetType = input.types.resolveSourceCallParameter(
      source,
      parameterIndex,
      sourceFile,
    );
    if (targetType === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(
        node,
        `Omitted source-owned selected parameter ${parameterIndex} has no closed C# type.`,
      ));
      return undefined;
    }
    const omitted = planCsharpSourceUndefinedValue(
      node,
      targetType,
      sourceFile,
      input,
      diagnostics,
    );
    if (omitted.kind !== "resolved") {
      diagnostics.push(unsupportedNodeDiagnostic(
        node,
        `Omitted source-owned selected parameter ${parameterIndex} has no exact C# representation for source undefined.`,
      ));
      return undefined;
    }
    planned.push({ kind: "Argument", expression: omitted.expression });
  }
  return planned;
}
