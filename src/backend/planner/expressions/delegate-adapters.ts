import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpConversionSelection } from "../../../analysis/conversions/index.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { getCsharpDelegateSignature, isCsharpVoidTargetType } from "../../../target-model/types/index.js";
import type { CsharpArgument, CsharpExpression, CsharpStatement } from "../../target-ast/roslyn/index.js";
import type { CsharpPlanningContext } from "../context.js";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import { planCsharpVoidReturn } from "../statements/statement-output.js";
import type { applyCsharpConversionSelection } from "./conversions.js";
import { csharpSourceModuleValueReferencesEqual, planCsharpSourceModuleValueReference } from "../bindings/module-values.js";

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
  const sourceSignature = getCsharpDelegateSignature(sourceType);
  const targetSignature = getCsharpDelegateSignature(targetType);
  const sourceDelegateType = sourceType === undefined ? undefined
    : csharpTypeFromTargetTypeRef(sourceType, input.scope.typeParameterNames);
  const targetDelegateType = targetType === undefined ? undefined
    : csharpTypeFromTargetTypeRef(targetType, input.scope.typeParameterNames);
  if (sourceSignature === undefined || targetSignature === undefined ||
    sourceDelegateType === undefined || targetDelegateType === undefined ||
    sourceSignature.parameters.length > targetSignature.parameters.length ||
    selection.parameterConversions.length !== sourceSignature.parameters.length) {
    diagnostics.push(unsupportedNodeDiagnostic(node,
      "C# delegate adaptation requires exact renderable source and target signatures."));
    return undefined;
  }
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
    : planCsharpSourceModuleValueReference(reference, node, sourceFile, input, diagnostics);
  const directReference = direct !== undefined && csharpSourceModuleValueReferencesEqual(expression, direct);
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
      ...(expression.async ? { async: true } : {}),
      parameters: sourceParameters as NonNullable<typeof sourceParameters[number]>[],
      body: expression.body.kind === "Block" ? expression.body : { kind: "Block", statements: [
        isCsharpVoidTargetType(sourceSignature.returnType)
          ? { kind: "ExpressionStatement", expression: expression.body }
          : { kind: "ReturnStatement", expression: expression.body },
      ] },
    });
  }
  const invocation: CsharpExpression = { kind: "InvocationExpression",
    callee: directReference ? expression : capturedReceiver === undefined ? { kind: "IdentifierName", name }
      : { kind: "SimpleMemberAccessExpression", receiver: { kind: "IdentifierName", name }, name: captured!.method.methodName },
    arguments: arguments_ };
  if (selection.returnConversion.kind === "void-return") {
    statements.push(...planCsharpVoidReturn(invocation, "absence", targetSignature.returnType, input.scope.typeParameterNames));
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
  return expression.kind === "LambdaExpression" || directReference ? adapter : {
    kind: "SwitchExpression",
    expression: capturedReceiver ?? { kind: "CastExpression", type: sourceDelegateType, expression },
    arms: [{ pattern: { kind: "VarPattern", designation: name }, expression: {
      kind: "CastExpression", type: targetDelegateType, expression: adapter,
    } }],
  };
}
