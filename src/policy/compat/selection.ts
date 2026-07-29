import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import {
  readCsharpTypescriptCompatibilityMode,
} from "../../options/csharp-target-options.js";
import type {
  CsharpTranslationContext,
} from "../../translate/context/index.js";
import {
  isCsharpAnyRuntimeCarrier,
} from "../types/index.js";

export type CsharpCompatAnySelection =
  | { readonly kind: "not-any" }
  | { readonly kind: "rejected"; readonly reason: string }
  | {
      readonly kind: "resolved";
      readonly runtimeMember: string;
      readonly dispatch: "instance" | "static";
      readonly result: "value" | "boolean" | "string";
      readonly lazyRight?: true;
    };

export type CsharpCompatAnyReceiverOperation =
  | "property-read"
  | "property-write"
  | "element-read"
  | "element-write"
  | "construct";

export type CsharpCompatAnyCallKind =
  | "direct"
  | "property"
  | "element";

export function selectCsharpCompatAnyReceiverOperation(
  input: CsharpTranslationContext,
  receiver: Node | undefined,
  sourceFile: SourceFile,
  operation: CsharpCompatAnyReceiverOperation,
  optional = false,
): CsharpCompatAnySelection {
  const mode = selectAnyMode(input, [receiver], sourceFile, operationLabel(operation));
  if (mode.kind !== "compat") {
    return mode;
  }
  const runtimeMember = receiverRuntimeMember(operation, optional);
  return runtimeMember === undefined
    ? {
        kind: "rejected",
        reason:
          `C# compatibility mode has no closed runtime operation for optional TypeScript any ${operationLabel(operation)}.`,
      }
    : {
        kind: "resolved",
        runtimeMember,
        dispatch: "instance",
        result: "value",
      };
}

export function selectCsharpCompatAnyCallOperation(
  input: CsharpTranslationContext,
  callee: Node | undefined,
  receiver: Node | undefined,
  sourceFile: SourceFile,
  callKind: CsharpCompatAnyCallKind,
  optionalCall: boolean,
): CsharpCompatAnySelection {
  const mode = selectAnyMode(input, [callee], sourceFile, "call");
  if (mode.kind !== "compat") {
    return mode;
  }
  if (
    callKind !== "direct" &&
    (
      receiver === undefined ||
      !isCsharpAnyRuntimeCarrier(input.types.resolveNode(receiver, sourceFile))
    )
  ) {
    return {
      kind: "rejected",
      reason:
        "C# compatibility member calls over TypeScript any require an exact closed compatibility receiver carrier.",
    };
  }
  return {
    kind: "resolved",
    runtimeMember: callKind === "property"
      ? "InvokeCompatSlot"
      : callKind === "element"
      ? "InvokeCompatElement"
      : optionalCall
      ? "InvokeCompatOptional"
      : "InvokeCompat",
    dispatch: "instance",
    result: "value",
  };
}

export function selectCsharpCompatAnyBinaryOperation(
  input: CsharpTranslationContext,
  left: Node | undefined,
  right: Node | undefined,
  sourceFile: SourceFile,
  operator: string,
): CsharpCompatAnySelection {
  const mode = selectAnyMode(
    input,
    [left, right],
    sourceFile,
    `operator '${operator}'`,
  );
  if (mode.kind !== "compat") {
    return mode;
  }
  if (booleanBinaryOperators.has(operator)) {
    return {
      kind: "resolved",
      runtimeMember: "ApplyCompatBinaryBoolean",
      dispatch: "static",
      result: "boolean",
    };
  }
  if (lazyBinaryOperators.has(operator)) {
    return {
      kind: "resolved",
      runtimeMember: "ApplyCompatLogical",
      dispatch: "static",
      result: "value",
      lazyRight: true,
    };
  }
  return eagerBinaryOperators.has(operator)
    ? {
        kind: "resolved",
        runtimeMember: "ApplyCompatBinary",
        dispatch: "static",
        result: "value",
      }
    : {
        kind: "rejected",
        reason:
          `C# compatibility mode has no closed runtime operation for TypeScript any operator '${operator}'.`,
      };
}

export function selectCsharpCompatAnyUnaryOperation(
  input: CsharpTranslationContext,
  operand: Node | undefined,
  sourceFile: SourceFile,
  operator: string,
): CsharpCompatAnySelection {
  const mode = selectAnyMode(
    input,
    [operand],
    sourceFile,
    `unary operator '${operator}'`,
  );
  if (mode.kind !== "compat") {
    return mode;
  }
  if (operator === "!") {
    return {
      kind: "resolved",
      runtimeMember: "ApplyCompatUnaryBoolean",
      dispatch: "static",
      result: "boolean",
    };
  }
  return valueUnaryOperators.has(operator)
    ? {
        kind: "resolved",
        runtimeMember: "ApplyCompatUnary",
        dispatch: "static",
        result: "value",
      }
    : {
        kind: "rejected",
        reason:
          `C# compatibility mode has no closed runtime operation for TypeScript any unary operator '${operator}'.`,
      };
}

export function selectCsharpCompatAnyTypeofOperation(
  input: CsharpTranslationContext,
  operand: Node | undefined,
  sourceFile: SourceFile,
): CsharpCompatAnySelection {
  const mode = selectAnyMode(input, [operand], sourceFile, "typeof");
  return mode.kind !== "compat"
    ? mode
    : {
        kind: "resolved",
        runtimeMember: "ApplyCompatTypeof",
        dispatch: "static",
        result: "string",
      };
}

export function selectCsharpCompatAnyVoidOperation(
  input: CsharpTranslationContext,
  operand: Node | undefined,
  sourceFile: SourceFile,
): CsharpCompatAnySelection {
  const mode = selectAnyMode(input, [operand], sourceFile, "void");
  return mode.kind !== "compat"
    ? mode
    : {
        kind: "resolved",
        runtimeMember: "ApplyCompatVoid",
        dispatch: "static",
        result: "value",
      };
}

export function selectCsharpCompatAnyCondition(
  input: CsharpTranslationContext,
  expression: Node | undefined,
  sourceFile: SourceFile,
): CsharpCompatAnySelection {
  const mode = selectAnyMode(input, [expression], sourceFile, "condition");
  return mode.kind !== "compat"
    ? mode
    : {
        kind: "resolved",
        runtimeMember: "ToCompatBoolean",
        dispatch: "static",
        result: "boolean",
      };
}

function selectAnyMode(
  input: CsharpTranslationContext,
  nodes: readonly (Node | undefined)[],
  sourceFile: SourceFile,
  operation: string,
):
  | Extract<CsharpCompatAnySelection, { readonly kind: "not-any" | "rejected" }>
  | { readonly kind: "compat" } {
  const usesAny = nodes.some((node) =>
    node !== undefined &&
    isCsharpAnyRuntimeCarrier(input.types.resolveNode(node, sourceFile))
  );
  if (!usesAny) {
    return { kind: "not-any" };
  }
  return readCsharpTypescriptCompatibilityMode(input.target) === "compat"
    ? { kind: "compat" }
    : {
        kind: "rejected",
        reason:
          `C# ${operation} uses TypeScript any in strict-native mode.`,
      };
}

function receiverRuntimeMember(
  operation: CsharpCompatAnyReceiverOperation,
  optional: boolean,
): string | undefined {
  switch (operation) {
    case "property-read":
      return optional ? "ReadCompatSlotOptional" : "ReadCompatSlot";
    case "property-write":
      return optional ? undefined : "WriteCompatSlot";
    case "element-read":
      return optional ? "ReadCompatElementOptional" : "ReadCompatElement";
    case "element-write":
      return optional ? undefined : "WriteCompatElement";
    case "construct":
      return optional ? undefined : "ConstructCompat";
  }
}

function operationLabel(
  operation: CsharpCompatAnyReceiverOperation,
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
