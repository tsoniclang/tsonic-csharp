import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpConversionSelection } from "../../../analysis/conversions/index.js";
import type { CsharpDelegateSignatureShape, TargetTypeRef } from "../../../target-model/types/model.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { csharpDelegateSignatureHasSupportedPassingModes, csharpDelegateSignaturesMatchNativeBinding, getCsharpDelegateSignature, getCsharpNullableElementTargetType, isCsharpVoidTargetType } from "../../../target-model/types/index.js";
import type { CsharpArgument, CsharpExpression, CsharpStatement, CsharpTypeNode } from "../../target-ast/roslyn/index.js";
import type { CsharpPlanningContext } from "../context.js";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import { planCsharpVoidReturn } from "../statements/statement-output.js";
import type { applyCsharpConversionSelection } from "./conversions.js";
import { csharpSourceModuleValueReferencesEqual, planCsharpSourceModuleValueReference } from "../bindings/module-values.js";
import { planCsharpExpressionCompletion } from "./planned-value-composition.js";

interface CsharpDelegateAdapterContract {
  readonly sourceSignature: CsharpDelegateSignatureShape;
  readonly targetSignature: CsharpDelegateSignatureShape;
  readonly sourceDelegateType: CsharpTypeNode;
  readonly targetDelegateType: CsharpTypeNode;
}

export function planCsharpDelegateAdapter(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  sourceType: TargetTypeRef | undefined,
  targetType: TargetTypeRef | undefined,
  selection: Extract<CsharpConversionSelection, { readonly kind: "delegate-adapter" }>,
  expression: CsharpExpression,
  convert: typeof applyCsharpConversionSelection,
): CsharpExpression | undefined {
  const contract = readDelegateAdapterContract(node, input, diagnostics, sourceType, targetType, selection);
  if (contract === undefined) return undefined;
  const { sourceSignature, targetSignature, targetDelegateType } = contract;
  if (selection.strategy === "native-binding") {
    if (!csharpDelegateSignaturesMatchNativeBinding(sourceSignature, targetSignature) ||
      selection.parameterConversions.some(conversion => conversion.kind !== "identity") ||
      selection.returnConversion.kind !== "identity" && !(selection.returnConversion.kind === "void-return" &&
        isCsharpVoidTargetType(sourceSignature.returnType) && isCsharpVoidTargetType(targetSignature.returnType))) {
      diagnostics.push(unsupportedNodeDiagnostic(node,
        "A sealed native delegate binding requires identical parameter and return passing signatures."));
      return undefined;
    }
    if (expression.kind === "LambdaExpression") {
      if (sourceSignature.returnPassing !== undefined || sourceSignature.parameterPassingModes.some(mode => mode !== "by-value")) {
        diagnostics.push(unsupportedNodeDiagnostic(node, "A by-reference native delegate binding requires an exact native method group or delegate value."));
        return undefined;
      }
      return expression;
    }
    const reference = input.program.conversions.directCallableReference(node);
    const direct = reference === undefined ? undefined
      : planCsharpSourceModuleValueReference(reference, input, diagnostics);
    const captured = input.program.captureStorage.closure(node);
    const methodGroup = direct !== undefined && csharpSourceModuleValueReferencesEqual(expression, direct) ||
      captured !== undefined && expression.kind === "SimpleMemberAccessExpression" &&
      expression.name === captured.method.methodName && sourceType !== undefined &&
      targetTypeRefEquals(captured.method.type, sourceType);
    return { kind: "ObjectCreationExpression", type: targetDelegateType, arguments: [{ kind: "Argument",
      expression: methodGroup ? expression : { kind: "SimpleMemberAccessExpression", receiver: expression, name: "Invoke" },
    }] };
  }
  if (selection.strategy !== "adaptation") {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Delegate conversion requires a sealed native binding or adaptation strategy."));
    return undefined;
  }
  const identity = sourceType === undefined || targetType === undefined || input.scope.delegateAdapters === undefined
    ? undefined : input.program.conversions.delegateAdapter(node, sourceType, targetType);
  if (identity !== undefined) {
    const name = input.scope.delegateAdapters?.get(identity);
    if (name === undefined ||
      !targetTypeRefEquals(identity.source, sourceType!) || !targetTypeRefEquals(identity.target, targetType!)) {
      diagnostics.push(unsupportedNodeDiagnostic(node, "A retained native delegate adapter requires its exact sealed conversion and lexical declaration."));
      return undefined;
    }
    return { kind: "ObjectCreationExpression", type: targetDelegateType,
      arguments: [{ kind: "Argument", expression: { kind: "IdentifierName", name } }] };
  }
  return planCsharpDelegateAdaptation(node, sourceFile, input, diagnostics, sourceType!, selection, expression, convert, contract);
}

export function planCsharpDelegateAdaptationBody(
  node: Node, sourceFile: SourceFile, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[],
  sourceType: TargetTypeRef, targetType: TargetTypeRef,
  selection: Extract<CsharpConversionSelection, { readonly kind: "delegate-adapter" }>,
  callee: CsharpExpression, convert: typeof applyCsharpConversionSelection,
): Extract<CsharpExpression, { kind: "LambdaExpression" }> | undefined {
  const contract = readDelegateAdapterContract(node, input, diagnostics, sourceType, targetType, selection);
  if (contract === undefined || selection.strategy !== "adaptation") return undefined;
  const planned = planCsharpDelegateAdaptation(node, sourceFile, input, diagnostics, sourceType, selection, callee, convert, contract, true);
  return planned?.kind === "LambdaExpression" ? planned : undefined;
}

function planCsharpDelegateAdaptation(
  node: Node, sourceFile: SourceFile, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[],
  sourceType: TargetTypeRef,
  selection: Extract<CsharpConversionSelection, { readonly kind: "delegate-adapter" }>,
  expression: CsharpExpression, convert: typeof applyCsharpConversionSelection,
  contract: CsharpDelegateAdapterContract,
  retained = false,
): CsharpExpression | undefined {
  const { sourceSignature, targetSignature, sourceDelegateType, targetDelegateType } = contract;
  const parameters = targetSignature.parameters.map((parameter, index) => {
    const type = csharpTypeFromTargetTypeRef(parameter, input.scope.typeParameterNames);
    return type === undefined ? undefined : { kind: "Parameter" as const,
      name: input.names.temporaryName(`__tsonic_arg${index}`), type };
  });
  if (parameters.some(parameter => parameter === undefined)) {
    diagnostics.push(unsupportedNodeDiagnostic(node,
      "C# delegate adaptation requires renderable exact target parameter types."));
    return undefined;
  }
  const arguments_: CsharpArgument[] = [];
  for (const [index, sourceParameter] of sourceSignature.parameters.entries()) {
    const converted = convert(node, sourceFile, input, diagnostics,
      targetSignature.parameters[index], sourceParameter, selection.parameterConversions[index]!,
      { kind: "IdentifierName", name: parameters[index]!.name });
    if (converted === undefined) return undefined;
    arguments_.push({ kind: "Argument", expression: converted });
  }
  const name = input.names.temporaryName("__tsonic_callable");
  const reference = input.program.conversions.directCallableReference(node);
  const direct = reference === undefined ? undefined
    : planCsharpSourceModuleValueReference(reference, input, diagnostics);
  const directReference = direct !== undefined && csharpSourceModuleValueReferencesEqual(expression, direct) ||
    expression.kind === "IdentifierName" && (input.program.captureStorage.namedSelf(node)?.values.length ?? 0) > 0;
  const captured = input.program.captureStorage.closure(node);
  const capturedReceiver = captured !== undefined && expression.kind === "SimpleMemberAccessExpression" &&
    expression.name === captured.method.methodName &&
    sourceType !== undefined && targetTypeRefEquals(captured.method.type, sourceType) ? expression.receiver : undefined;
  const statements: CsharpStatement[] = [];
  if (expression.kind === "LambdaExpression") {
    const returnType = csharpTypeFromTargetTypeRef(sourceSignature.returnType, input.scope.typeParameterNames);
    const sourceParameters = expression.parameters.map((parameter, index) => {
      const carrier = sourceSignature.parameters[index];
      const type = parameter.type ?? (carrier === undefined ? undefined
        : csharpTypeFromTargetTypeRef(carrier, input.scope.typeParameterNames));
      return type === undefined ? undefined : { ...parameter, type };
    });
    if (returnType === undefined || sourceParameters.length !== sourceSignature.parameters.length ||
      sourceParameters.some(parameter => parameter === undefined)) {
      diagnostics.push(unsupportedNodeDiagnostic(node,
        "An adapted lambda requires its exact native function parameters and return type."));
      return undefined;
    }
    statements.push({ kind: "LocalFunctionStatement", name, returnType,
      modifiers: expression.async ? ["async"] : [],
      parameters: sourceParameters as NonNullable<typeof sourceParameters[number]>[],
      body: expression.body.kind === "Block" ? expression.body : { kind: "Block", statements: [
        isCsharpVoidTargetType(sourceSignature.returnType)
          ? { kind: "ExpressionStatement", expression: expression.body }
          : { kind: "ReturnStatement", expression: expression.body },
      ] },
    });
  }
  const invocation: CsharpExpression = { kind: "InvocationExpression",
    callee: retained || directReference ? expression : capturedReceiver === undefined ? { kind: "IdentifierName", name }
      : { kind: "SimpleMemberAccessExpression", receiver: { kind: "IdentifierName", name }, name: captured!.method.methodName },
    arguments: arguments_ };
  if (selection.returnConversion.kind === "void-return") {
    const completion = planCsharpExpressionCompletion(node, sourceFile, input, diagnostics, invocation, sourceSignature.returnType);
    if (completion === undefined) return undefined;
    statements.push(...planCsharpVoidReturn(completion,
      isCsharpVoidTargetType(targetSignature.returnType) ? "void" : "absence", targetSignature.returnType, input.scope.typeParameterNames));
  } else {
    const converted = convert(node, sourceFile, input, diagnostics, sourceSignature.returnType,
      targetSignature.returnType, selection.returnConversion, invocation);
    if (converted === undefined) return undefined;
    statements.push(isCsharpVoidTargetType(targetSignature.returnType)
      ? { kind: "ExpressionStatement", expression: converted }
      : { kind: "ReturnStatement", expression: converted });
  }
  const adapter: CsharpExpression = { kind: "LambdaExpression",
    parameters: parameters as NonNullable<typeof parameters[number]>[],
    body: { kind: "Block", statements } };
  return retained || expression.kind === "LambdaExpression" || directReference ? adapter : {
    kind: "SwitchExpression",
    expression: capturedReceiver ?? { kind: "CastExpression", type: sourceDelegateType, expression },
    arms: [{ pattern: { kind: "VarPattern", designation: name }, expression: {
      kind: "CastExpression", type: targetDelegateType, expression: adapter,
    } }],
  };
}

function readDelegateAdapterContract(node: Node, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[],
  sourceType: TargetTypeRef | undefined, targetType: TargetTypeRef | undefined,
  selection: Extract<CsharpConversionSelection, { readonly kind: "delegate-adapter" }>): CsharpDelegateAdapterContract | undefined {
  const sourceSignature = getCsharpDelegateSignature(sourceType);
  const targetSignature = getCsharpDelegateSignature(targetType);
  const sourceDelegateType = sourceType === undefined ? undefined
    : csharpTypeFromTargetTypeRef(sourceType, input.scope.typeParameterNames);
  const targetDelegateType = targetType === undefined ? undefined
    : csharpTypeFromTargetTypeRef(getCsharpNullableElementTargetType(targetType) ?? targetType, input.scope.typeParameterNames);
  if (sourceSignature === undefined || targetSignature === undefined ||
    !csharpDelegateSignatureHasSupportedPassingModes(sourceSignature) ||
    !csharpDelegateSignatureHasSupportedPassingModes(targetSignature) ||
    sourceDelegateType === undefined || targetDelegateType === undefined ||
    sourceSignature.parameters.length > targetSignature.parameters.length ||
    selection.parameterConversions.length !== sourceSignature.parameters.length) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "C# delegate adaptation requires exact renderable source and target signatures."));
    return undefined;
  }
  if (selection.strategy === "adaptation" && (sourceSignature.returnPassing !== undefined || targetSignature.returnPassing !== undefined ||
    sourceSignature.parameterPassingModes.some(mode => mode !== "by-value") ||
    targetSignature.parameterPassingModes.some(mode => mode !== "by-value"))) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Delegate adaptation cannot change or wrap native by-reference passing."));
    return undefined;
  }
  return { sourceSignature, targetSignature, sourceDelegateType, targetDelegateType };
}
