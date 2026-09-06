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
} from "../../target-ast/roslyn/index.js";
import type {
  DestructuringPlannerState,
} from "../bindings/index.js";
import type {
  ExpectedExpressionPlanner,
  ExpressionPlanner,
} from "./expression-planner-types.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../types/target-types.js";
import { csharpRuntimeRawPointerTargetType } from "../../../target-model/types/runtime-carriers.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { planCsharpNativeMemoryCall } from "./native-memory.js";

export type CsharpNativePointerOperationPlan =
  | { readonly handled: false }
  | { readonly handled: true; readonly expression?: CsharpExpression };

export function tryPlanCsharpNativePointerOperation(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  planExpressionWithExpectedType: ExpectedExpressionPlanner,
  state: DestructuringPlannerState | undefined,
): CsharpNativePointerOperationPlan {
  const selection = input.program.operations.nativePointer(node);
  if (selection === undefined) {
    return { handled: false };
  }
  if (selection.kind === "not-native-pointer") {
    return { handled: false };
  }
  if (selection.kind === "rejected") {
    diagnostics.push(nativePointerDiagnostic(
      "CSHARP_NATIVE_POINTER_OPERATION_NOT_MAPPED",
      `C# native-pointer '${selection.operation}' is not mapped: ${selection.reason}`,
    ));
    return { handled: true };
  }
  if (selection.kind === "raw-location") {
    if (selection.method === "Reinterpret" && (state?.explicitUnsafeContextDepth ?? 0) === 0) {
      diagnostics.push(nativePointerDiagnostic("CSHARP_NATIVE_POINTER_UNSAFE_CONTEXT_REQUIRED",
        "Raw memory reinterpretation requires an explicit unsafeContext() source region."));
      return { handled: true };
    }
    const type = csharpTypeFromTargetTypeRef(selection.inputType);
    const value = type === undefined ? undefined : planExpressionWithExpectedType(
      selection.expression, sourceFile, input, diagnostics, type, undefined, selection.inputType, state);
    return { handled: true, expression: value === undefined ? undefined : planCsharpNativeMemoryCall(selection.method, value, selection.layout) };
  }
  if (selection.kind === "raw-address") {
    const arguments_: CsharpExpression[] = [];
    for (const argument of selection.arguments) {
      const sourceType = csharpTypeFromTargetTypeRef(argument.sourceType);
      const parameterType = csharpTypeFromTargetTypeRef(argument.parameterType);
      const expression = sourceType === undefined ? undefined : planExpressionWithExpectedType(
        argument.expression, sourceFile, input, diagnostics, sourceType, undefined, argument.sourceType, state);
      if (expression === undefined || parameterType === undefined) return { handled: true };
      arguments_.push(targetTypeRefEquals(argument.sourceType, argument.parameterType)
        ? expression : { kind: "CastExpression", type: parameterType,
          expression: { kind: "ParenthesizedExpression", expression } });
    }
    const rawType = csharpTypeFromTargetTypeRef(csharpRuntimeRawPointerTargetType());
    const resultType = csharpTypeFromTargetTypeRef(selection.resultType);
    if (rawType === undefined || resultType === undefined) return { handled: true };
    arguments_.push({ kind: "NumericLiteralExpression", value: selection.width });
    const invocation: CsharpExpression = { kind: "InvocationExpression",
      callee: { kind: "SimpleMemberAccessExpression", receiver: rawType, name: selection.method },
      arguments: arguments_.map(expression => ({ kind: "Argument", expression })) };
    return { handled: true, expression: selection.method === "Address"
      ? { kind: "CastExpression", type: resultType, expression: invocation } : invocation };
  }
  if (selection.kind === "layout-query") {
    return { handled: true, expression: { kind: "NumericLiteralExpression", value: selection.value } };
  }
  if (selection.kind === "raw-identity") {
    const receiver = csharpTypeFromTargetTypeRef(selection.carrier);
    const arguments_ = selection.arguments.map(argument => planExpression(argument, sourceFile, input, diagnostics, state));
    return { handled: true, ...(receiver === undefined || arguments_.some(argument => argument === undefined) ? {} : {
      expression: {
        kind: "InvocationExpression" as const,
        callee: { kind: "SimpleMemberAccessExpression" as const, receiver, name: selection.method },
        arguments: (arguments_ as CsharpExpression[]).map(expression => ({ kind: "Argument" as const, expression })),
      },
    }) };
  }
  if ((state?.explicitUnsafeContextDepth ?? 0) === 0) {
    diagnostics.push(nativePointerDiagnostic(
      "CSHARP_NATIVE_POINTER_UNSAFE_CONTEXT_REQUIRED",
      `C# native-pointer '${selection.kind}' requires an explicit unsafeContext()/unsafe() source region.`,
    ));
    return { handled: true };
  }
  const pointer = planExpression(
    selection.pointerExpression,
    sourceFile,
    input,
    diagnostics,
    state,
  );
  if (pointer === undefined) {
    return { handled: true };
  }
  const dereference: CsharpExpression = {
    kind: "PrefixUnaryExpression",
    operatorToken: { kind: "AsteriskToken" },
    operand: pointer,
  };
  switch (selection.kind) {
    case "load":
      return { handled: true, expression: dereference };
    case "store": {
      const pointeeType = csharpTypeFromTargetTypeRef(selection.pointeeType);
      const value = pointeeType === undefined
        ? undefined
        : planExpressionWithExpectedType(
            selection.valueExpression,
            sourceFile,
            input,
            diagnostics,
            pointeeType,
            undefined,
            selection.pointeeType,
            state,
          );
      return {
        handled: true,
        ...(value === undefined
          ? {}
          : {
              expression: {
                kind: "AssignmentExpression",
                left: dereference,
                operatorToken: { kind: "EqualsToken" },
                right: value,
              },
            }),
      };
    }
    case "offset": {
      const offsetType = csharpTypeFromTargetTypeRef(selection.offsetType);
      const offset = offsetType === undefined
        ? undefined
        : planExpressionWithExpectedType(
            selection.offsetExpression,
            sourceFile,
            input,
            diagnostics,
            offsetType,
            undefined,
            selection.offsetType,
            state,
          );
      return {
        handled: true,
        ...(offset === undefined
          ? {}
          : {
              expression: {
                kind: "BinaryExpression",
                left: pointer,
                operatorToken: { kind: "PlusToken" },
                right: offset,
              },
            }),
      };
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
