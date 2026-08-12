import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  CsharpTranslationContext,
} from "../../translate/context/index.js";
import type {
  TargetTypeRef,
} from "../types/index.js";
import {
  csharpSourcePrimitiveTargetType,
  targetTypeRefEquals,
} from "../types/index.js";
import {
  readCsharpSourceNativePointerOperation,
} from "./source-native-pointers.js";

export type CsharpNativePointerOperationKind = "load" | "store" | "offset";

export type CsharpNativePointerOperationSelection =
  | { readonly kind: "not-native-pointer" }
  | {
      readonly kind: "rejected";
      readonly operation: CsharpNativePointerOperationKind;
      readonly reason: string;
    }
  | CsharpResolvedNativePointerOperation;

export type CsharpResolvedNativePointerOperation =
  | CsharpResolvedNativePointerOperationBase & {
      readonly kind: "load";
    }
  | CsharpResolvedNativePointerOperationBase & {
      readonly kind: "store";
      readonly valueExpression: Node;
    }
  | CsharpResolvedNativePointerOperationBase & {
      readonly kind: "offset";
      readonly offsetExpression: Node;
      readonly offsetType: TargetTypeRef;
    };

interface CsharpResolvedNativePointerOperationBase {
  readonly call: Node;
  readonly pointerExpression: Node;
  readonly pointerType: Extract<TargetTypeRef, { readonly kind: "pointer" }>;
  readonly pointeeType: TargetTypeRef;
}

export function selectCsharpNativePointerOperation(
  input: CsharpTranslationContext,
  node: Node,
  sourceFile: SourceFile,
): CsharpNativePointerOperationSelection {
  const source = readCsharpSourceNativePointerOperation(
    input.sourceFacts,
    node,
  );
  if (source === undefined) {
    return { kind: "not-native-pointer" };
  }
  const pointerType = input.types.resolveSelectedValue(
    source.pointerExpression,
    source.pointerType,
    sourceFile,
  );
  if (pointerType?.kind !== "pointer") {
    return rejected(
      source.operation,
      "The selected native-pointer operand has no exact C# native-pointer representation.",
    );
  }
  if (source.explicitPointeeTypeNode !== undefined) {
    const explicitPointee = input.types.resolveSelectedType(
      source.explicitPointeeTypeNode,
      source.pointeeType,
      sourceFile,
    );
    if (
      explicitPointee === undefined ||
      !targetTypeRefEquals(explicitPointee, pointerType.pointee)
    ) {
      return rejected(
        source.operation,
        "The authored pointee type and selected native-pointer operand do not have one exact C# representation.",
      );
    }
  }
  const base: CsharpResolvedNativePointerOperationBase = {
    call: node,
    pointerExpression: source.pointerExpression,
    pointerType,
    pointeeType: pointerType.pointee,
  };
  switch (source.operation) {
    case "load":
      return { ...base, kind: source.operation };
    case "store": {
      const valueType = input.types.resolveSelectedValue(
        source.valueExpression,
        source.valueType,
        sourceFile,
      );
      return valueType === undefined
        ? rejected(
            source.operation,
            "The selected native-pointer store value has no closed C# representation.",
          )
        : {
            ...base,
            kind: source.operation,
            valueExpression: source.valueExpression,
          };
    }
    case "offset": {
      const offsetType = input.types.resolveSelectedValue(
        source.offsetExpression,
        source.offsetType,
        sourceFile,
      );
      return offsetType === undefined ||
          !targetTypeRefEquals(
            offsetType,
            csharpSourcePrimitiveTargetType("native-int"),
          )
        ? rejected(
            source.operation,
            "The selected native-pointer element offset is not exactly native-int in C#.",
          )
        : {
            ...base,
            kind: source.operation,
            offsetExpression: source.offsetExpression,
            offsetType,
          };
    }
  }
}

function rejected(
  operation: CsharpNativePointerOperationKind,
  reason: string,
): CsharpNativePointerOperationSelection {
  return { kind: "rejected", operation, reason };
}
