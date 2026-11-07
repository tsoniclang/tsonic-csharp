import type { CsharpNativePointerOperationKind, CsharpNativePointerOperationSelection, CsharpResolvedNativePointerOperationBase } from "../../../target-model/records/native/native-pointers.js";
import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpPolicyContext } from "../../../policy/model/context.js";

import { csharpSourcePrimitiveTargetType, targetTypeRefEquals } from "../../../policy/types/index.js";
import { readCsharpSourceNativePointerOperation } from "../../../source/extension/native-pointers.js";
import { readCsharpSourceRawPointerIdentity } from "../../../source/extension/raw-pointers.js";
import { csharpRuntimeRawPointerTargetType, isCsharpAbsenceTargetType } from "../../../target-model/types/carriers/runtime-carriers.js";
import { csharpNullableReferenceTargetType, getCsharpNullableElementTargetType } from "../../../target-model/types/carriers/nullable.js";
import { selectCsharpRawAddress } from "./raw-addresses.js";

import { selectCsharpLayoutObservation } from "../../../policy/operations/pointers/layout-observations.js";
import { selectCsharpRawLocation } from "./native-memory.js";
import { selectTargetNativePointerOperation } from "@tsonic/target-api/analysis";

export function selectCsharpNativePointerOperation(
  input: CsharpPolicyContext,
  node: Node,
): CsharpNativePointerOperationSelection {
  const rawLocation = selectCsharpRawLocation(input, node);
  const layout = selectCsharpLayoutObservation(input.facts, node);
  const address = selectCsharpRawAddress(input, node);
  return selectTargetNativePointerOperation(rawLocation, layout, address,
    selectRawIdentity(input, node), selectNativePointer(input, node)) ?? { kind: "not-native-pointer" };
}

/** The represented published value type of an operand (facts.values.type); a .NET refusal closes no carrier. */
function operandCarrier(input: CsharpPolicyContext, expression: Node): TargetTypeRef | undefined {
  const represented = input.types.value(expression);
  return represented.kind === "csharp-refused" ? undefined : represented;
}

function selectRawIdentity(input: CsharpPolicyContext, node: Node):
  Exclude<CsharpNativePointerOperationSelection, { readonly kind: "not-native-pointer" }> | undefined {
  const identity = readCsharpSourceRawPointerIdentity(input.facts, input.sourceFacts, node);
  if (identity !== undefined) {
    const arguments_ = input.ast.arguments(node);
    const carrier = csharpRuntimeRawPointerTargetType();
    if (identity.call !== node || identity.arguments.length !== arguments_.length ||
      identity.arguments.some((argument, index) => argument.expression !== arguments_[index])) {
      return rejected(identity.operation, "Raw pointer identity requires exact selected call arguments.");
    }
    for (const argument of identity.arguments) {
      const selected = operandCarrier(input, argument.expression);
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

function selectNativePointer(input: CsharpPolicyContext, node: Node):
  Exclude<CsharpNativePointerOperationSelection, { readonly kind: "not-native-pointer" }> | undefined {
  const source = readCsharpSourceNativePointerOperation(input.facts, node);
  if (source === undefined) {
    return undefined;
  }
  if (source.kind === "rejected") return rejected(source.operation, source.reason);
  const pointerType = operandCarrier(input, source.pointer.expression);
  if (pointerType?.kind !== "pointer") {
    return rejected(
      source.operation,
      "The selected native-pointer operand has no exact C# native-pointer representation.",
    );
  }
  if (source.explicitPointeeTypeNode !== undefined) {
    // The source-core Host record publishes the selected pointee as a Host descriptor (K-2662).
    const explicitPointee = input.types.represent(source.pointee, source.explicitPointeeTypeNode, "type-argument");
    if (
      explicitPointee.kind === "csharp-refused" ||
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
    pointerExpression: source.pointer.expression,
    pointerType,
    pointeeType: pointerType.pointee,
  };
  switch (source.operation) {
    case "load":
      return { ...base, kind: source.operation };
    case "store": {
      const valueType = operandCarrier(input, source.value.expression);
      return valueType === undefined
        ? rejected(
            source.operation,
            "The selected native-pointer store value has no closed C# representation.",
          )
        : {
            ...base,
            kind: source.operation,
            valueExpression: source.value.expression,
          };
    }
    case "offset": {
      const offsetType = operandCarrier(input, source.offset.expression);
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
            offsetExpression: source.offset.expression,
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
