import { csharpSourcePrimitiveTargetType, csharpStringTargetType, csharpTsValueTargetType, isCsharpJsValueTargetType, targetTypeRefEquals } from "../../types/index.js";
import type { TargetTypeRef } from "../../types/index.js";

import type { CsharpJsValueInvocation, CsharpJsValueOperationSelection, CsharpJsValueReceiverOperation, CsharpJsValueCallKind, CsharpJsValueRuntimeMember } from "../../../target-model/operations/js-values.js";
import type { CsharpSourceOperator } from "../../../target-model/syntax/operators.js";
export type { CsharpJsValueInvocation, CsharpJsValueOperationSelection, CsharpJsValueReceiverOperation, CsharpJsValueCallKind } from "../../../target-model/operations/js-values.js";

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
  if (logicalRuntimeMembers.has(selection.runtimeMember) ?
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

export function selectCsharpNativeJsValueCallOperation(
  calleeType: TargetTypeRef | undefined, receiverType: TargetTypeRef | undefined, callKind: CsharpJsValueCallKind, optionalCall: boolean,
): CsharpJsValueOperationSelection {
  const selection = selectJsValueMode([calleeType]);
  if (selection.kind !== "js-value") {
    return selection;
  }
  if (
    callKind !== "direct" &&
    (
      !isCsharpJsValueTargetType(receiverType)
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

export function selectCsharpNativeJsValueBinaryOperation(
  left: TargetTypeRef | undefined, right: TargetTypeRef | undefined, storage: TargetTypeRef | undefined, operator: CsharpSourceOperator | "",
): CsharpJsValueOperationSelection {
  if ((operator === "??" || operator === "??=") &&
    isCsharpJsValueTargetType(storage)) {
    return { kind: "not-js-value" };
  }
  const mode = selectJsValueMode([left, right]);
  if (mode.kind !== "js-value") {
    return mode;
  }
  const booleanMember = booleanBinaryOperators.get(operator);
  if (booleanMember !== undefined) {
    return {
      kind: "resolved",
      runtimeMember: booleanMember,
      dispatch: "static",
      resultType: csharpSourcePrimitiveTargetType("bool"),
    };
  }
  const lazyMember = lazyBinaryOperators.get(operator);
  if (lazyMember !== undefined) {
    return {
      kind: "resolved",
      runtimeMember: lazyMember,
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
  const valueMember = eagerBinaryOperators.get(operator);
  return valueMember !== undefined
    ? {
        kind: "resolved",
        runtimeMember: valueMember,
        dispatch: "static",
        resultType: csharpTsValueTargetType(),
      }
    : {
        kind: "rejected",
        reason:
          `The closed C# JS-value runtime has no operation for operator '${operator}'.`,
      };
}

export function selectCsharpNativeJsValueUnaryOperation(
  operand: TargetTypeRef | undefined, operator: CsharpSourceOperator | "",
): CsharpJsValueOperationSelection {
  const mode = selectJsValueMode([operand]);
  if (mode.kind !== "js-value") {
    return mode;
  }
  if (operator === "!") {
    return {
      kind: "resolved",
      runtimeMember: "LogicalNot",
      dispatch: "static",
      resultType: csharpSourcePrimitiveTargetType("bool"),
    };
  }
  const valueMember = valueUnaryOperators.get(operator);
  return valueMember !== undefined
    ? {
        kind: "resolved",
        runtimeMember: valueMember,
        dispatch: "static",
        resultType: csharpTsValueTargetType(),
      }
    : {
        kind: "rejected",
        reason:
          `The closed C# JS-value runtime has no operation for unary operator '${operator}'.`,
      };
}

export function selectCsharpNativeJsValueTypeofOperation(
  type: TargetTypeRef | undefined,
): CsharpJsValueOperationSelection {
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

export function selectCsharpNativeJsValueVoidOperation(
  operand: TargetTypeRef | undefined,
): CsharpJsValueOperationSelection {
  const mode = selectJsValueMode([operand]);
  return mode.kind !== "js-value"
    ? mode
    : {
        kind: "resolved",
        runtimeMember: "ApplyDynamicVoid",
        dispatch: "static",
        resultType: csharpTsValueTargetType(),
      };
}

export function selectCsharpNativeJsValueConditionOperation(
  expression: TargetTypeRef | undefined,
): CsharpJsValueOperationSelection {
  const mode = selectJsValueMode([expression]);
  return mode.kind !== "js-value"
    ? mode
    : {
        kind: "resolved",
        runtimeMember: "ToDynamicBoolean",
        dispatch: "static",
        resultType: csharpSourcePrimitiveTargetType("bool"),
      };
}

function selectJsValueMode(types: readonly (TargetTypeRef | undefined)[]): { readonly kind: "js-value" | "not-js-value" } {
  return types.some(isCsharpJsValueTargetType) ? { kind: "js-value" } : { kind: "not-js-value" };
}
function receiverRuntimeMember(
  operation: CsharpJsValueReceiverOperation,
  optional: boolean,
): CsharpJsValueRuntimeMember | undefined {
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

const eagerBinaryOperators = new Map<string, CsharpJsValueRuntimeMember>([
  ["+", "Add"],
  ["-", "Subtract"],
  ["*", "Multiply"],
  ["/", "Divide"],
  ["%", "Remainder"],
]);

const lazyBinaryOperators = new Map<string, CsharpJsValueRuntimeMember>([
  ["&&", "And"],
  ["||", "Or"],
  ["??", "Coalesce"],
]);

const logicalRuntimeMembers = new Set(lazyBinaryOperators.values());

const booleanBinaryOperators = new Map<string, CsharpJsValueRuntimeMember>([
  ["==", "Equal"],
  ["!=", "NotEqual"],
  ["===", "StrictEqual"],
  ["!==", "StrictNotEqual"],
  ["<", "LessThan"],
  ["<=", "LessThanOrEqual"],
  [">", "GreaterThan"],
  [">=", "GreaterThanOrEqual"],
]);

const valueUnaryOperators = new Map<string, CsharpJsValueRuntimeMember>([
  ["+", "Positive"],
  ["-", "Negate"],
  ["~", "BitwiseNot"],
]);
