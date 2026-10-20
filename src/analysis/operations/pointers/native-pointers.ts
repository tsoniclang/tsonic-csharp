import type { CsharpNativePointerOperationKind, CsharpNativePointerOperationSelection, CsharpResolvedNativePointerOperationBase } from "../../../target-model/records/native-pointers.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { CsharpPolicyContext } from "../../../policy/model/context.js";

import { csharpSourcePrimitiveTargetType, targetTypeRefEquals } from "../../../policy/types/index.js";
import { readCsharpSourceNativePointerOperation } from "../../../policy/operations/pointers/source-native-pointers.js";
import { readCsharpSourceRawPointerIdentity } from "../../../policy/operations/pointers/source-raw-pointers.js";
import { csharpRuntimeRawPointerTargetType, isCsharpAbsenceTargetType } from "../../../target-model/types/carriers/runtime-carriers.js";
import { csharpNullableReferenceTargetType, getCsharpNullableElementTargetType } from "../../../target-model/types/carriers/nullable.js";
import { selectCsharpRawAddress } from "../../../policy/operations/pointers/raw-addresses.js";

import { selectCsharpLayoutObservation } from "../../../policy/operations/pointers/layout-observations.js";
import { selectCsharpRawLocation } from "./native-memory.js";
import { selectTargetNativePointerOperation } from "@tsonic/target-api/analysis";

export function selectCsharpNativePointerOperation(
  input: CsharpPolicyContext,
  node: Node,
  sourceFile: SourceFile,
): CsharpNativePointerOperationSelection {
  const rawLocation = selectCsharpRawLocation(input, node, sourceFile);
  const layout = selectCsharpLayoutObservation(input.sourceFacts, node);
  const address = selectCsharpRawAddress(input, node, sourceFile);
  return selectTargetNativePointerOperation(rawLocation, layout, address,
    selectRawIdentity(input, node, sourceFile), selectNativePointer(input, node, sourceFile)) ?? { kind: "not-native-pointer" };
}

function selectRawIdentity(input: CsharpPolicyContext, node: Node, sourceFile: SourceFile):
  Exclude<CsharpNativePointerOperationSelection, { readonly kind: "not-native-pointer" }> | undefined {
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
      if (!isCsharpAbsenceTargetType(value) && (value === undefined || !targetTypeRefEquals(value, carrier))) {
        return rejected(identity.operation, "Raw pointer identity requires the closed address carrier, not an arbitrary object.");
      }
    }
    return { kind: "raw-identity", method: identity.operation === "equal-raw-pointer" ? "Same" : "Hash",
      arguments: Object.freeze(identity.arguments.map(argument => argument.expression)), carrier,
      parameterType: csharpNullableReferenceTargetType(carrier) };
  }
  return undefined;
}

function selectNativePointer(input: CsharpPolicyContext, node: Node, sourceFile: SourceFile):
  Exclude<CsharpNativePointerOperationSelection, { readonly kind: "not-native-pointer" }> | undefined {
  const source = readCsharpSourceNativePointerOperation(
    input.sourceFacts,
    node,
  );
  if (source === undefined) {
    return undefined;
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
): Extract<CsharpNativePointerOperationSelection, { readonly kind: "rejected" }> {
  return { kind: "rejected", operation, reason };
}
