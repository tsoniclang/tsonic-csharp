import type {
  CsharpNativeRefReturnSelection, CsharpTypedLocationOperand, CsharpTypedLocationOperationKind,
  CsharpTypedLocationOperationSelection,
} from "../../../target-model/records/typed-locations.js";
import type { Node } from "@tsonic/tsts";

import {
  csharpRuntimeLocationPointee, csharpRuntimeLocationTargetType, csharpDelegateTargetType,
  csharpNullableReferenceTargetType, isCsharpNullableReferenceTargetType, isCsharpValueTypeTargetType,
  isCsharpAbsenceTargetType, targetTypeRefEquals, type CsharpTargetMember, type TargetTypeRef,
} from "../../types/index.js";


import type { CsharpSourceTypedLocationOperation } from "../../../source/extension/typed-locations.js";
export function selectCsharpNativeTypedLocationOperation(
  source: CsharpSourceTypedLocationOperation,
  pointeeType: TargetTypeRef,
  carriers: ReadonlyMap<Node, TargetTypeRef>,
  nativeLocation: CsharpNativeRefReturnSelection | undefined,
  storage: import("../../../target-model/records/typed-location-storage.js").CsharpTypedLocationStorageSelection | undefined,
): CsharpTypedLocationOperationSelection {
  if (nativeLocation?.kind === "rejected") return rejected(source.kind, nativeLocation.reason);
  const locationType = csharpRuntimeLocationTargetType(pointeeType);
  switch (source.kind) {
    case "location-view": {
      const sourceLocation = carriers.get(source.locationExpression);
      const sourcePointee = csharpRuntimeLocationPointee(sourceLocation) ??
        carriers.get(source.call);
      if (sourcePointee === undefined || sourceLocation === undefined ||
        !isCsharpTypedLocationEqualityOperand(sourceLocation, sourcePointee) ||
        (!source.optional && (isCsharpNullableReferenceTargetType(sourceLocation) ||
          isCsharpAbsenceTargetType(sourceLocation)))) {
        return rejected(source.kind, "Pointer views require the exact source location carrier.");
      }
      const parameter = csharpRuntimeLocationTargetType(sourcePointee);
      return {
        kind: source.kind, call: source.call, pointeeType, locationType,
        method: source.optional ? "ViewOptional" : "View", typeArguments: [sourcePointee],
        arguments: [
          { expression: source.locationExpression, type: source.optional
            ? csharpNullableReferenceTargetType(parameter) : parameter },
          { expression: source.readExpression, type: csharpDelegateTargetType("System.Func", [], pointeeType) },
          { expression: source.writeExpression, type: csharpDelegateTargetType("System.Action", [pointeeType]) },
        ],
      };
    }
    case "location-hash": {
      const operand = carriers.get(source.locationExpression);
      return isCsharpTypedLocationEqualityOperand(operand, pointeeType)
        ? { kind: source.kind, call: source.call, pointeeType, locationType,
            parameterType: csharpNullableReferenceTargetType(locationType),
            locationExpression: source.locationExpression }
        : rejected(source.kind, "Pointer hashing requires an exact location carrier or undefined.");
    }
    case "location-bind": {
      const identity = carriers.get(source.identityExpression);
      if (identity === undefined || isCsharpValueTypeTargetType(identity)) {
        return rejected(source.kind, "Pointer binding requires stable reference identity, not a boxed value.");
      }
      return {
        kind: source.kind, call: source.call, pointeeType, locationType,
        method: "Bind", typeArguments: [],
        arguments: [
          { expression: source.identityExpression, type: identity },
          { expression: source.readExpression, type: csharpDelegateTargetType("System.Func", [], pointeeType) },
          { expression: source.writeExpression, type: csharpDelegateTargetType("System.Action", [pointeeType]) },
        ],
      };
    }
    case "location-project": {
      const sourceLocation = carriers.get(source.locationExpression);
      const operandPointee = csharpRuntimeLocationPointee(sourceLocation);
      const sourcePointee = source.explicitSourcePointeeTypeNode === undefined
        ? operandPointee
        : carriers.get(source.explicitSourcePointeeTypeNode);
      if (sourceLocation === undefined || sourcePointee === undefined ||
        !isCsharpTypedLocationEqualityOperand(sourceLocation, sourcePointee)) {
        return rejected(source.kind, "Pointer projection requires the exact source location carrier.");
      }
      const optional = isCsharpNullableReferenceTargetType(sourceLocation) ||
        isCsharpAbsenceTargetType(sourceLocation);
      return {
        kind: source.kind, call: source.call, pointeeType, locationType,
        method: optional ? "ProjectOptional" : "Project",
        typeArguments: [sourcePointee],
        arguments: [
          { expression: source.locationExpression, type: optional
            ? csharpNullableReferenceTargetType(csharpRuntimeLocationTargetType(sourcePointee))
            : sourceLocation },
          { expression: source.fromSourceExpression, type: csharpDelegateTargetType("System.Func", [sourcePointee], pointeeType) },
          { expression: source.toSourceExpression, type: csharpDelegateTargetType("System.Func", [pointeeType], sourcePointee) },
        ],
      };
    }
    case "location-address": {
      const storageType = carriers.get(source.storageExpression);
      if (
        storageType === undefined ||
        !targetTypeRefEquals(storageType, pointeeType)
      ) {
        return rejected(
          source.kind,
          "The selected storage and pointee do not have one exact C# target type.",
        );
      }
      if (storage === undefined) return rejected(source.kind, "The selected writable storage has no admitted C# location.");
      return storage.kind === "rejected"
        ? rejected(source.kind, storage.reason)
        : {
            kind: source.kind,
            call: source.call,
            pointeeType,
            locationType,
            storage: storage.storage,
          };
    }
    case "location-allocate":
      return carriers.get(source.initialExpression) === undefined
        ? rejected(
            source.kind,
            "The selected initial value has no closed C# representation.",
          )
        : {
            kind: source.kind,
            call: source.call,
            pointeeType,
            locationType,
            initialExpression: source.initialExpression,
          };
    case "location-load":
    case "location-store": {
      const location = selectCsharpTypedLocationOperand(source.locationExpression, pointeeType, locationType, nativeLocation, carriers.get(source.locationExpression));
      if (location.kind === "rejected") {
        return rejected(
          source.kind,
          location.reason,
        );
      }
      if (source.kind === "location-load") {
        return {
          kind: source.kind,
          call: source.call,
          pointeeType,
          locationType,
          location: location.location,
        };
      }
      if (
        location.location.kind === "native-ref-return" &&
        location.location.returnPassing === "byref-readonly"
      ) {
        return rejected(
          source.kind,
          `The selected C# ref-return '${location.location.targetIdentity}' exposes a readonly native location.`,
        );
      }
      return carriers.get(source.valueExpression) === undefined
        ? rejected(
            source.kind,
            "The selected stored value has no closed C# representation.",
          )
        : {
            kind: source.kind,
            call: source.call,
            pointeeType,
            locationType,
            location: location.location,
            valueExpression: source.valueExpression,
          };
    }
    case "location-equal": {
      const leftType = carriers.get(source.leftExpression);
      const rightType = carriers.get(source.rightExpression);
      if (
        !isCsharpTypedLocationEqualityOperand(leftType, pointeeType) ||
        !isCsharpTypedLocationEqualityOperand(rightType, pointeeType)
      ) {
        return rejected(
          source.kind,
          "Each selected equality operand must be the exact C# typed-location carrier or source undefined.",
        );
      }
      return {
        kind: source.kind,
        call: source.call,
        pointeeType,
        locationType,
        leftExpression: source.leftExpression,
        rightExpression: source.rightExpression,
        parameterType: csharpNullableReferenceTargetType(locationType),
      };
    }
  }
}

type CsharpTypedLocationOperandSelection =
  | {
      readonly kind: "resolved";
      readonly location: CsharpTypedLocationOperand;
    }
  | { readonly kind: "rejected"; readonly reason: string };

function selectCsharpTypedLocationOperand(
  expression: Node,
  pointeeType: TargetTypeRef,
  locationType: TargetTypeRef,
  native: CsharpNativeRefReturnSelection | undefined,
  selectedLocationType: TargetTypeRef | undefined,
): CsharpTypedLocationOperandSelection {
  if (native?.kind === "rejected") {
    return native;
  }
  if (native?.kind === "resolved") {
    if (
      native.returnType === undefined ||
      !targetTypeRefEquals(native.returnType, pointeeType)
    ) {
      return {
        kind: "rejected",
        reason:
          `The selected C# ref-return '${native.targetIdentity}' does not return the exact typed-location pointee type.`,
      };
    }
    return {
      kind: "resolved",
      location: {
        kind: "native-ref-return",
        expression,
        targetIdentity: native.targetIdentity,
        returnPassing: native.returnPassing,
      },
    };
  }
  return selectedLocationType !== undefined &&
      targetTypeRefEquals(selectedLocationType, locationType)
    ? {
        kind: "resolved",
        location: { kind: "runtime-location", expression },
      }
    : {
        kind: "rejected",
        reason:
          "The selected location operand is neither the exact C# runtime-location carrier nor an exact provider ref return.",
      };
}

export function nativeRefReturnFromMember(
  member: CsharpTargetMember,
  optionalChain: boolean,
): CsharpNativeRefReturnSelection {
  if (member.csharpReturnPassing === undefined) {
    return { kind: "not-native" };
  }
  if (optionalChain) {
    return {
      kind: "rejected",
      reason:
        `The selected C# ref-return member '${member.id}' cannot be accessed through an optional chain.`,
    };
  }
  return {
    kind: "resolved",
    targetIdentity: `member:${member.id}`,
    returnPassing: member.csharpReturnPassing,
    returnType: member.returnType,
  };
}

function isCsharpTypedLocationEqualityOperand(
  operandType: TargetTypeRef | undefined,
  pointeeType: TargetTypeRef,
): boolean {
  if (isCsharpAbsenceTargetType(operandType)) {
    return true;
  }
  const operandPointee = csharpRuntimeLocationPointee(operandType);
  return operandPointee !== undefined &&
    targetTypeRefEquals(operandPointee, pointeeType);
}

function rejected(
  operation: CsharpTypedLocationOperationKind,
  reason: string,
): CsharpTypedLocationOperationSelection {
  return { kind: "rejected", operation, reason };
}
