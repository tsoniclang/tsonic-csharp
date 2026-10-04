import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  CsharpPolicyContext,
} from "../model/context.js";
import {
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpTsValueTargetType,
  isCsharpJsValueTargetType,
  targetTypeRefEquals,
} from "../types/index.js";
import type {
  TargetTypeRef,
} from "../types/index.js";

import type { CsharpJsValueInvocation, CsharpJsValueOperationSelection, CsharpJsValueReceiverOperation, CsharpJsValueCallKind } from "../../target-model/operations/js-values.js";
export type { CsharpJsValueInvocation, CsharpJsValueOperationSelection, CsharpJsValueReceiverOperation, CsharpJsValueCallKind } from "../../target-model/operations/js-values.js";

export function validateCsharpJsValueOperationSelection(
  selection: CsharpJsValueOperationSelection,
): CsharpJsValueOperationSelection {
  if (selection.kind !== "resolved") return selection;
  let presentMember: string | undefined;
  let receiverReadMember: string | undefined;
  switch (selection.runtimeMember) {
    case "ReadDynamicSlotOptional":
      presentMember = receiverRuntimeMember("property-read", false);
      break;
    case "ReadDynamicElementOptional":
      presentMember = receiverRuntimeMember("element-read", false);
      break;
    case "InvokeDynamic":
    case "InvokeDynamicOptional":
      presentMember = "InvokeDynamic";
      break;
    case "InvokeDynamicSlot":
      presentMember = "InvokeDynamicWithThis";
      receiverReadMember = receiverRuntimeMember("property-read", false);
      break;
    case "InvokeDynamicElement":
      presentMember = "InvokeDynamicWithThis";
      receiverReadMember = receiverRuntimeMember("element-read", false);
      break;
  }
  const coherent = (operation: CsharpJsValueInvocation | undefined, member: string | undefined): boolean =>
    member === undefined ? operation === undefined : operation !== undefined &&
      operation.runtimeMember === member && operation.dispatch === "instance" &&
      targetTypeRefEquals(operation.resultType, csharpTsValueTargetType()) &&
      targetTypeRefEquals(operation.resultType, selection.resultType);
  if (!coherent(selection.presentOperation, presentMember) ||
      !coherent(selection.receiverReadOperation, receiverReadMember) ||
      presentMember !== undefined && selection.dispatch !== "instance") {
    return { kind: "rejected", reason: "A closed JS operation requires its exact selected present invocation and receiver-read correspondence." };
  }
  const shortCircuit = selection.shortCircuit;
  if (selection.runtimeMember === "ApplyDynamicLogical" ?
    shortCircuit === undefined || !targetTypeRefEquals(selection.resultType, csharpTsValueTargetType()) ||
      !targetTypeRefEquals(shortCircuit.condition.resultType, csharpSourcePrimitiveTargetType("bool")) ||
      (shortCircuit.whenTrue !== "left" && shortCircuit.whenTrue !== "right") ||
      !(shortCircuit.condition.runtimeMember === "ToDynamicBoolean" && shortCircuit.condition.dispatch === "static" ||
        shortCircuit.condition.runtimeMember === "isUndefined" && shortCircuit.condition.dispatch === "instance" && shortCircuit.whenTrue === "right")
    : shortCircuit !== undefined) {
    return { kind: "rejected", reason: "A closed logical operation requires its exact selected native condition and lazy branch relation." };
  }
  return Object.freeze({ ...selection,
    ...(selection.presentOperation === undefined ? {} : { presentOperation: Object.freeze({ ...selection.presentOperation }) }),
    ...(selection.receiverReadOperation === undefined ? {} : { receiverReadOperation: Object.freeze({ ...selection.receiverReadOperation }) }),
    ...(shortCircuit === undefined ? {} : { shortCircuit: Object.freeze({ ...shortCircuit,
      condition: Object.freeze({ ...shortCircuit.condition }) }) }),
  });
}

export function selectCsharpJsObjectLiteralOperation(): Extract<
  CsharpJsValueOperationSelection,
  { readonly kind: "resolved" }
> {
  return {
    kind: "resolved",
    runtimeMember: "CreateDynamicObject",
    dispatch: "static",
    resultType: csharpTsValueTargetType(),
  };
}

export function selectCsharpJsValueReceiverExpressionOperation(
  input: CsharpPolicyContext,
  receiver: Node | undefined,
  sourceFile: SourceFile,
  operation: CsharpJsValueReceiverOperation,
  optional = false,
): CsharpJsValueOperationSelection {
  const selection = selectJsValueMode(input, [receiver], sourceFile);
  if (selection.kind !== "js-value") {
    return selection;
  }
  return selectCsharpJsValueReceiverOperation(
    input.types.resolveNode(receiver, sourceFile),
    operation,
    optional,
  );
}

export function selectCsharpJsValueReceiverOperation(
  receiverType: TargetTypeRef | undefined,
  operation: CsharpJsValueReceiverOperation,
  optional = false,
): CsharpJsValueOperationSelection {
  if (!isCsharpJsValueTargetType(receiverType)) {
    return { kind: "not-js-value" };
  }
  const runtimeMember = receiverRuntimeMember(operation, optional);
  const presentMember = receiverRuntimeMember(operation, false);
  return runtimeMember === undefined
    ? {
        kind: "rejected",
        reason:
          `The closed C# JS-value runtime has no optional ${operationLabel(operation)} operation.`,
      }
    : {
        kind: "resolved",
        runtimeMember,
        dispatch: "instance",
        resultType: csharpTsValueTargetType(),
        ...(optional && presentMember !== undefined ? { presentOperation: {
          runtimeMember: presentMember,
          dispatch: "instance" as const,
          resultType: csharpTsValueTargetType(),
        } } : {}),
      };
}

export function selectCsharpJsValueCallOperation(
  input: CsharpPolicyContext,
  callee: Node | undefined,
  receiver: Node | undefined,
  sourceFile: SourceFile,
  callKind: CsharpJsValueCallKind,
  optionalCall: boolean,
): CsharpJsValueOperationSelection {
  const selection = selectJsValueMode(input, [callee], sourceFile);
  if (selection.kind !== "js-value") {
    return selection;
  }
  if (
    callKind !== "direct" &&
    (
      receiver === undefined ||
      !isCsharpJsValueTargetType(input.types.resolveNode(receiver, sourceFile))
    )
  ) {
    return {
      kind: "rejected",
      reason:
        "JS-value member calls require an exact closed receiver carrier.",
    };
  }
  return {
    kind: "resolved",
    runtimeMember: callKind === "property"
      ? "InvokeDynamicSlot"
      : callKind === "element"
      ? "InvokeDynamicElement"
      : optionalCall
      ? "InvokeDynamicOptional"
      : "InvokeDynamic",
    dispatch: "instance",
    resultType: csharpTsValueTargetType(),
    presentOperation: {
      runtimeMember: callKind === "direct" ? "InvokeDynamic" : "InvokeDynamicWithThis",
      dispatch: "instance",
      resultType: csharpTsValueTargetType(),
    },
    ...(callKind === "direct" ? {} : { receiverReadOperation: {
      runtimeMember: callKind === "property" ? "ReadDynamicSlot" : "ReadDynamicElement",
      dispatch: "instance" as const,
      resultType: csharpTsValueTargetType(),
    } }),
  };
}

export function selectCsharpJsValueBinaryOperation(
  input: CsharpPolicyContext,
  left: Node | undefined,
  right: Node | undefined,
  sourceFile: SourceFile,
  operator: string,
): CsharpJsValueOperationSelection {
  if ((operator === "??" || operator === "??=") &&
    isCsharpJsValueTargetType(input.types.resolveReadStorage(left))) {
    return { kind: "not-js-value" };
  }
  const mode = selectJsValueOperandMode(
    input,
    [left, right],
    sourceFile,
  );
  if (mode.kind !== "js-value") {
    return mode;
  }
  if (booleanBinaryOperators.has(operator)) {
    return {
      kind: "resolved",
      runtimeMember: "ApplyDynamicBinaryBoolean",
      dispatch: "static",
      resultType: csharpSourcePrimitiveTargetType("bool"),
    };
  }
  if (lazyBinaryOperators.has(operator)) {
    return {
      kind: "resolved",
      runtimeMember: "ApplyDynamicLogical",
      dispatch: "static",
      resultType: csharpTsValueTargetType(),
      shortCircuit: {
        condition: {
          runtimeMember: operator === "??" ? "isUndefined" : "ToDynamicBoolean",
          dispatch: operator === "??" ? "instance" : "static",
          resultType: csharpSourcePrimitiveTargetType("bool"),
        },
        whenTrue: operator === "||" ? "left" : "right",
      },
    };
  }
  return eagerBinaryOperators.has(operator)
    ? {
        kind: "resolved",
        runtimeMember: "ApplyDynamicBinary",
        dispatch: "static",
        resultType: csharpTsValueTargetType(),
      }
    : {
        kind: "rejected",
        reason:
          `The closed C# JS-value runtime has no operation for operator '${operator}'.`,
      };
}

export function selectCsharpJsValueUnaryOperation(
  input: CsharpPolicyContext,
  operand: Node | undefined,
  sourceFile: SourceFile,
  operator: string,
): CsharpJsValueOperationSelection {
  const mode = selectJsValueOperandMode(
    input,
    [operand],
    sourceFile,
  );
  if (mode.kind !== "js-value") {
    return mode;
  }
  if (operator === "!") {
    return {
      kind: "resolved",
      runtimeMember: "ApplyDynamicUnaryBoolean",
      dispatch: "static",
      resultType: csharpSourcePrimitiveTargetType("bool"),
    };
  }
  return valueUnaryOperators.has(operator)
    ? {
        kind: "resolved",
        runtimeMember: "ApplyDynamicUnary",
        dispatch: "static",
        resultType: csharpTsValueTargetType(),
      }
    : {
        kind: "rejected",
        reason:
          `The closed C# JS-value runtime has no operation for unary operator '${operator}'.`,
      };
}

export function selectCsharpJsTypeofOperation(
  input: CsharpPolicyContext,
  operand: Node | undefined,
  sourceFile: SourceFile,
): CsharpJsValueOperationSelection {
  const type = operand === undefined
    ? undefined
    : input.types.resolveNode(operand, sourceFile);
  if (isCsharpJsValueTargetType(type)) {
    return {
        kind: "resolved",
        runtimeMember: "ApplyDynamicTypeof",
        dispatch: "static",
        resultType: csharpStringTargetType(),
      };
  }
  return { kind: "not-js-value" };
}

export function selectCsharpJsValueVoidOperation(
  input: CsharpPolicyContext,
  operand: Node | undefined,
  sourceFile: SourceFile,
): CsharpJsValueOperationSelection {
  const mode = selectJsValueOperandMode(input, [operand], sourceFile);
  return mode.kind !== "js-value"
    ? mode
    : {
        kind: "resolved",
        runtimeMember: "ApplyDynamicVoid",
        dispatch: "static",
        resultType: csharpTsValueTargetType(),
      };
}

export function selectCsharpJsValueCondition(
  input: CsharpPolicyContext,
  expression: Node | undefined,
  sourceFile: SourceFile,
): CsharpJsValueOperationSelection {
  const mode = selectJsValueOperandMode(
    input,
    [expression],
    sourceFile,
  );
  return mode.kind !== "js-value"
    ? mode
    : {
        kind: "resolved",
        runtimeMember: "ToDynamicBoolean",
        dispatch: "static",
        resultType: csharpSourcePrimitiveTargetType("bool"),
      };
}

function selectJsValueMode(
  input: CsharpPolicyContext,
  nodes: readonly (Node | undefined)[],
  sourceFile: SourceFile,
):
  | Extract<CsharpJsValueOperationSelection, { readonly kind: "not-js-value" | "rejected" }>
  | { readonly kind: "js-value" } {
  const usesJsValue = nodes.some((node) =>
    node !== undefined &&
    isCsharpJsValueTargetType(input.types.resolveNode(node, sourceFile))
  );
  if (!usesJsValue) {
    return { kind: "not-js-value" };
  }
  return { kind: "js-value" };
}

function selectJsValueOperandMode(
  input: CsharpPolicyContext,
  nodes: readonly (Node | undefined)[],
  sourceFile: SourceFile,
):
  | Extract<CsharpJsValueOperationSelection, { readonly kind: "not-js-value" | "rejected" }>
  | { readonly kind: "js-value" } {
  const types = nodes.map((node) =>
    node === undefined ? undefined : input.types.resolveNode(node, sourceFile)
  );
  if (!types.some((type) => isCsharpJsValueTargetType(type))) {
    return { kind: "not-js-value" };
  }
  return { kind: "js-value" };
}

function receiverRuntimeMember(
  operation: CsharpJsValueReceiverOperation,
  optional: boolean,
): string | undefined {
  switch (operation) {
    case "property-read":
      return optional ? "ReadDynamicSlotOptional" : "ReadDynamicSlot";
    case "property-write":
      return optional ? undefined : "WriteDynamicSlot";
    case "element-read":
      return optional ? "ReadDynamicElementOptional" : "ReadDynamicElement";
    case "element-write":
      return optional ? undefined : "WriteDynamicElement";
    case "construct":
      return optional ? undefined : "ConstructDynamic";
  }
}

function operationLabel(
  operation: CsharpJsValueReceiverOperation,
): string {
  switch (operation) {
    case "property-read":
      return "property read";
    case "property-write":
      return "property write";
    case "element-read":
      return "element read";
    case "element-write":
      return "element write";
    case "construct":
      return "construction";
  }
}

const eagerBinaryOperators = new Set([
  "+",
  "-",
  "*",
  "/",
  "%",
]);

const lazyBinaryOperators = new Set([
  "&&",
  "||",
  "??",
]);

const booleanBinaryOperators = new Set([
  "==",
  "!=",
  "===",
  "!==",
  "<",
  "<=",
  ">",
  ">=",
]);

const valueUnaryOperators = new Set([
  "+",
  "-",
  "~",
]);
