import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import {
  selectCsharpNativePointerOperation,
} from "../../../policy/operations/index.js";
import type {
  CsharpPlanningContext,
} from "../context.js";
import type {
  CsharpExpression,
} from "../../roslyn/syntax.js";
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
  const selection = selectCsharpNativePointerOperation(input, node, sourceFile);
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
