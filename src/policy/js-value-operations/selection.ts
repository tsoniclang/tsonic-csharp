import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  CsharpPolicyContext,
} from "../context.js";
import {
  csharpBooleanTargetType,
  csharpStringTargetType,
  csharpTsValueTargetType,
  isCsharpJsValueTargetType,
} from "../types/index.js";
import type {
  TargetTypeRef,
} from "../types/index.js";

export type CsharpJsValueOperationSelection =
  | { readonly kind: "not-js-value" }
  | { readonly kind: "rejected"; readonly reason: string }
  | {
      readonly kind: "resolved";
      readonly runtimeMember: string;
      readonly dispatch: "instance" | "static";
      readonly resultType: TargetTypeRef;
      readonly lazyRight?: true;
    };

export type CsharpJsValueReceiverOperation =
  | "property-read"
  | "property-write"
  | "element-read"
  | "element-write"
  | "construct";

export type CsharpJsValueCallKind =
  | "direct"
  | "property"
  | "element";

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
  };
}

export function selectCsharpJsValueBinaryOperation(
  input: CsharpPolicyContext,
  left: Node | undefined,
  right: Node | undefined,
  sourceFile: SourceFile,
  operator: string,
): CsharpJsValueOperationSelection {
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
      resultType: csharpBooleanTargetType(),
    };
  }
  if (lazyBinaryOperators.has(operator)) {
    return {
      kind: "resolved",
      runtimeMember: "ApplyDynamicLogical",
      dispatch: "static",
      resultType: csharpTsValueTargetType(),
      lazyRight: true,
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
      resultType: csharpBooleanTargetType(),
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
        resultType: csharpBooleanTargetType(),
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
