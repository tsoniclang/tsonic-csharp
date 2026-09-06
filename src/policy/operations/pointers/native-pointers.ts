import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  CsharpPolicyContext,
} from "../../context.js";
import type {
  TargetTypeRef,
} from "../../types/index.js";
import {
  csharpSourcePrimitiveTargetType,
  targetTypeRefEquals,
} from "../../types/index.js";
import {
  readCsharpSourceNativePointerOperation,
} from "./source-native-pointers.js";
import { readCsharpSourceRawPointerIdentity } from "./source-raw-pointers.js";
import { csharpRuntimeRawPointerTargetType, isCsharpRuntimeUndefinedTargetType } from "../../../target-model/types/runtime-carriers.js";
import { getCsharpNullableElementTargetType } from "../../../target-model/types/nullable.js";
import { selectCsharpRawAddress } from "./raw-addresses.js";
import type { CsharpRawAddressSelection, CsharpSourceRawAddressOperation } from "./raw-addresses.js";
import { selectCsharpLayoutObservation } from "./layout-observations.js";
import { selectCsharpRawLocation, type CsharpRawLocationSelection } from "./native-memory.js";

export type CsharpNativePointerOperationKind = "load" | "store" | "offset" | "equal-raw-pointer" | "hash-raw-pointer" | "layout-query" | "raw-location" | CsharpSourceRawAddressOperation["operation"];

export type CsharpNativePointerOperationSelection =
  | { readonly kind: "not-native-pointer" }
  | {
      readonly kind: "rejected";
      readonly operation: CsharpNativePointerOperationKind;
      readonly reason: string;
    }
  | CsharpResolvedNativePointerOperation;

export type CsharpResolvedNativePointerOperation =
  | Extract<CsharpRawLocationSelection, { readonly kind: "raw-location" }>
  | { readonly kind: "layout-query"; readonly value: number }
  | Extract<CsharpRawAddressSelection, { readonly kind: "raw-address" }>
  | {
      readonly kind: "raw-identity";
      readonly method: "Same" | "Hash";
      readonly arguments: readonly Node[];
      readonly carrier: TargetTypeRef;
    }
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
  input: CsharpPolicyContext,
  node: Node,
  sourceFile: SourceFile,
): CsharpNativePointerOperationSelection {
  const rawLocation = selectCsharpRawLocation(input, node, sourceFile);
  if (rawLocation !== undefined) return rawLocation;
  const layout = selectCsharpLayoutObservation(input.sourceFacts, node);
  if (layout !== undefined) return layout;
  const address = selectCsharpRawAddress(input, node, sourceFile);
  if (address !== undefined) return address;
  const identity = readCsharpSourceRawPointerIdentity(input.sourceFacts, node);
  if (identity !== undefined) {
    const arguments_ = input.ast.arguments(node);
    const carrier = csharpRuntimeRawPointerTargetType();
    if (identity.call !== node || identity.arguments.length !== arguments_.length ||
      identity.arguments.some((argument, index) => argument.expression !== arguments_[index])) {
      return rejected(identity.operation, "Raw pointer identity requires exact selected call arguments.");
    }
    for (const argument of identity.arguments) {
      const selected = input.types.resolveSelectedValue(argument.expression, argument.type, sourceFile);
      const value = getCsharpNullableElementTargetType(selected) ?? selected;
      if (!isCsharpRuntimeUndefinedTargetType(value) && (value === undefined || !targetTypeRefEquals(value, carrier))) {
        return rejected(identity.operation, "Raw pointer identity requires the closed address carrier, not an arbitrary object.");
      }
    }
    return { kind: "raw-identity", method: identity.operation === "equal-raw-pointer" ? "Same" : "Hash",
      arguments: Object.freeze(identity.arguments.map(argument => argument.expression)), carrier };
  }
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
