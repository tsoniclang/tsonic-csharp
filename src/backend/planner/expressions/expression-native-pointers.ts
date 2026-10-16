import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpPlanningContext,
} from "../context.js";
import type {
  CsharpExpression,
} from "../../target-ast/syntax/index.js";
import type {
  DestructuringPlannerState,
} from "../bindings/index.js";
import type { ExpressionPlanner } from "./expression-planner-types.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../types/target-types.js";
import { csharpRuntimeRawPointerTargetType } from "../../../target-model/types/carriers/runtime-carriers.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { planCsharpNativeMemoryCall } from "./native-memory.js";
import { mapCsharpPlannedValue, type CsharpPlannedValue } from "./planned-values.js";
import { buildCsharpPlannedValue, planCsharpExpressionCompletion, projectCsharpPlannedValue } from "./planned-value-composition.js";
import type { CsharpNativeHandler } from "../../../target-model/records/native-handlers.js";

export function planCsharpNativePointerOperation(node: Node, selection: Extract<CsharpNativeHandler, { readonly kind: "native-pointer" }>["selection"], sourceFile: SourceFile, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[], planExpression: ExpressionPlanner, state: DestructuringPlannerState | undefined
): CsharpPlannedValue | undefined {
  if (selection.kind === "rejected") {
    diagnostics.push(nativePointerDiagnostic(
      "CSHARP_NATIVE_POINTER_OPERATION_NOT_MAPPED",
      `C# native-pointer '${selection.operation}' is not mapped: ${selection.reason}`,
    ));
    return undefined;
  }
  if (selection.kind === "raw-location") {
    if (selection.method === "Reinterpret" && (state?.explicitUnsafeContextDepth ?? 0) === 0) {
      diagnostics.push(nativePointerDiagnostic("CSHARP_NATIVE_POINTER_UNSAFE_CONTEXT_REQUIRED",
        "Raw memory reinterpretation requires an explicit unsafecontext() source region."));
      return undefined;
    }
    const type = csharpTypeFromTargetTypeRef(selection.inputType, input.scope.typeParameterNames);
    const value = type === undefined ? undefined : planExpression(selection.expression, sourceFile, input, diagnostics, state);
    return projectCsharpPlannedValue(node, sourceFile, input, diagnostics, value,
      value => planCsharpNativeMemoryCall(input.scope.typeParameterNames, selection.method, value, selection.layout));
  }
  if (selection.kind === "raw-address") {
    const arguments_: CsharpPlannedValue[] = [];
    for (const argument of selection.arguments) {
      const sourceType = csharpTypeFromTargetTypeRef(argument.sourceType, input.scope.typeParameterNames);
      const parameterType = csharpTypeFromTargetTypeRef(argument.parameterType, input.scope.typeParameterNames);
      const expression = sourceType === undefined ? undefined : planExpression(argument.expression, sourceFile, input, diagnostics, state);
      if (expression === undefined || parameterType === undefined) return undefined;
      const adapted = targetTypeRefEquals(argument.sourceType, argument.parameterType)
        ? expression : mapCsharpPlannedValue(expression, argument.parameterType, value => ({ kind: "CastExpression", type: parameterType,
          expression: { kind: "ParenthesizedExpression", expression: value } }));
      if (adapted === undefined) return undefined;
      arguments_.push(adapted);
    }
    const rawType = csharpTypeFromTargetTypeRef(csharpRuntimeRawPointerTargetType(), input.scope.typeParameterNames);
    const resultType = csharpTypeFromTargetTypeRef(selection.resultType, input.scope.typeParameterNames);
    if (rawType === undefined || resultType === undefined) return undefined;
    return buildCsharpPlannedValue(node, sourceFile, input, diagnostics, arguments_, values => {
    const invocation: CsharpExpression = { kind: "InvocationExpression",
      callee: { kind: "SimpleMemberAccessExpression", receiver: rawType, name: selection.method },
      arguments: [...values, { kind: "NumericLiteralExpression" as const, value: selection.width }].map(expression => ({ kind: "Argument", expression })) };
    return selection.method === "Address" ? { kind: "CastExpression", type: resultType, expression: invocation } : invocation;
    }, selection.resultType);
  }
  if (selection.kind === "layout-query") {
    return planCsharpExpressionCompletion(node, sourceFile, input, diagnostics, { kind: "NumericLiteralExpression", value: selection.value });
  }
  if (selection.kind === "raw-identity") {
    const receiver = csharpTypeFromTargetTypeRef(selection.carrier, input.scope.typeParameterNames);
    const parameter = csharpTypeFromTargetTypeRef(selection.parameterType, input.scope.typeParameterNames);
    const arguments_ = selection.arguments.map(argument => parameter === undefined ? undefined : planExpression(argument, sourceFile, input, diagnostics, state));
    return receiver === undefined || arguments_.some(argument => argument === undefined) ? undefined
      : buildCsharpPlannedValue(node, sourceFile, input, diagnostics, arguments_, values => ({
        kind: "InvocationExpression" as const,
        callee: { kind: "SimpleMemberAccessExpression" as const, receiver, name: selection.method },
        arguments: values.map(expression => ({ kind: "Argument" as const, expression })),
      }));
  }
  if ((state?.explicitUnsafeContextDepth ?? 0) === 0) {
    diagnostics.push(nativePointerDiagnostic(
      "CSHARP_NATIVE_POINTER_UNSAFE_CONTEXT_REQUIRED",
      `C# native-pointer '${selection.kind}' requires an explicit unsafecontext()/unsafe() source region.`,
    ));
    return undefined;
  }
  const pointer = planExpression(
    selection.pointerExpression,
    sourceFile,
    input,
    diagnostics,
    state,
  );
  if (pointer === undefined) {
    return undefined;
  }
  const dereference = (value: CsharpExpression): CsharpExpression => ({
    kind: "PrefixUnaryExpression",
    operatorToken: { kind: "AsteriskToken" },
    operand: value,
  });
  switch (selection.kind) {
    case "load":
      return projectCsharpPlannedValue(node, sourceFile, input, diagnostics, pointer, dereference);
    case "store": {
      const pointeeType = csharpTypeFromTargetTypeRef(selection.pointeeType, input.scope.typeParameterNames);
      const value = pointeeType === undefined
        ? undefined
        : planExpression(selection.valueExpression, sourceFile, input, diagnostics, state
          );
      return value === undefined ? undefined
        : buildCsharpPlannedValue(node, sourceFile, input, diagnostics, [pointer, value], values => ({
                kind: "AssignmentExpression",
                left: dereference(values[0]!),
                operatorToken: { kind: "EqualsToken" },
                right: values[1]!,
              }));
    }
    case "offset": {
      const offsetType = csharpTypeFromTargetTypeRef(selection.offsetType, input.scope.typeParameterNames);
      const offset = offsetType === undefined
        ? undefined
        : planExpression(selection.offsetExpression, sourceFile, input, diagnostics, state
          );
      return offset === undefined ? undefined
        : buildCsharpPlannedValue(node, sourceFile, input, diagnostics, [pointer, offset], values => ({
                kind: "BinaryExpression",
                left: values[0]!,
                operatorToken: { kind: "PlusToken" },
                right: values[1]!,
              }));
    }
  }
}

function nativePointerDiagnostic(
  code: string,
  message: string,
): TargetDiagnostic {
  return {
    code,
    category: "error",
    source: "tsonic-csharp",
    message,
  };
}
