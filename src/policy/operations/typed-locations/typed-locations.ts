import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  CsharpPolicyContext,
} from "../../context.js";
import {
  csharpRuntimeLocationPointee,
  csharpRuntimeLocationTargetType,
  isCsharpRuntimeUndefinedTargetType,
  targetTypeRefEquals,
  type TargetTypeRef,
} from "../../types/index.js";
import {
  readCsharpSourceTypedLocationOperation,
} from "./source-typed-locations.js";
import type {
  CsharpTypedLocationStorage,
} from "./typed-location-storage.js";
import {
  selectCsharpTypedLocationStorage,
} from "./typed-location-storage.js";

export type {
  CsharpTypedLocationDirectIdentity,
  CsharpTypedLocationStorage,
  CsharpTypedLocationStorageSelection,
} from "./typed-location-storage.js";

export type CsharpTypedLocationOperationSelection =
  | { readonly kind: "not-typed-location" }
  | {
      readonly kind: "rejected";
      readonly operation: CsharpTypedLocationOperationKind;
      readonly reason: string;
    }
  | CsharpResolvedTypedLocationOperation;

export type CsharpTypedLocationOperationKind =
  | "location-address"
  | "location-allocate"
  | "location-load"
  | "location-store"
  | "location-equal"
  | "location-hash"
  | "location-bind"
  | "location-project";

export type CsharpResolvedTypedLocationOperation =
  | {
      readonly kind: "location-address";
      readonly call: Node;
      readonly pointeeType: TargetTypeRef;
      readonly locationType: TargetTypeRef;
      readonly storage: CsharpTypedLocationStorage;
    }
  | {
      readonly kind: "location-allocate";
      readonly call: Node;
      readonly pointeeType: TargetTypeRef;
      readonly locationType: TargetTypeRef;
      readonly initialExpression: Node;
    }
  | {
      readonly kind: "location-load";
      readonly call: Node;
      readonly pointeeType: TargetTypeRef;
      readonly locationType: TargetTypeRef;
      readonly locationExpression: Node;
    }
  | {
      readonly kind: "location-store";
      readonly call: Node;
      readonly pointeeType: TargetTypeRef;
      readonly locationType: TargetTypeRef;
      readonly locationExpression: Node;
      readonly valueExpression: Node;
    }
  | {
      readonly kind: "location-equal";
      readonly call: Node;
      readonly pointeeType: TargetTypeRef;
      readonly locationType: TargetTypeRef;
      readonly leftExpression: Node;
      readonly rightExpression: Node;
    };

export function selectCsharpTypedLocationOperation(
  input: CsharpPolicyContext,
  node: Node,
  sourceFile: SourceFile,
): CsharpTypedLocationOperationSelection {
  const source = readCsharpSourceTypedLocationOperation(
    input.sourceFacts,
    node,
  );
  if (source === undefined) {
    return { kind: "not-typed-location" };
  }
  if (
    source.kind === "location-hash" ||
    source.kind === "location-bind" ||
    source.kind === "location-project"
  ) {
    return rejected(
      source.kind,
      `The selected '${source.sourceOperation}' operation has no accepted C# target contract.`,
    );
  }
  const pointeeType = input.types.resolveTypedLocationOperationPointee(
    source,
    sourceFile,
  );
  if (pointeeType === undefined) {
    return rejected(
      source.kind,
      "The exact selected pointee type has no closed C# representation.",
    );
  }
  const locationType = csharpRuntimeLocationTargetType(pointeeType);
  switch (source.kind) {
    case "location-address": {
      const storageType = input.types.resolveSelectedValue(
        source.storageExpression,
        source.storageType,
        sourceFile,
      );
      if (
        storageType === undefined ||
        !targetTypeRefEquals(storageType, pointeeType)
      ) {
        return rejected(
          source.kind,
          "The selected storage and pointee do not have one exact C# target type.",
        );
      }
      const storage = selectCsharpTypedLocationStorage(
        input,
        source.storageExpression,
        storageType,
        sourceFile,
        new WeakSet<Node>(),
        source.storageDeclaration,
      );
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
      return input.types.resolveSelectedValue(
          source.initialExpression,
          source.initialType,
          sourceFile,
        ) === undefined
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
      const selectedLocationType = input.types.resolveSelectedValue(
        source.locationExpression,
        source.locationType,
        sourceFile,
      );
      if (
        selectedLocationType === undefined ||
        !targetTypeRefEquals(selectedLocationType, locationType)
      ) {
        return rejected(
          source.kind,
          "The selected location operand does not have the exact C# typed-location carrier.",
        );
      }
      if (source.kind === "location-load") {
        return {
          kind: source.kind,
          call: source.call,
          pointeeType,
          locationType,
          locationExpression: source.locationExpression,
        };
      }
      return input.types.resolveSelectedValue(
          source.valueExpression,
          source.valueType,
          sourceFile,
        ) === undefined
        ? rejected(
            source.kind,
            "The selected stored value has no closed C# representation.",
          )
        : {
            kind: source.kind,
            call: source.call,
            pointeeType,
            locationType,
            locationExpression: source.locationExpression,
            valueExpression: source.valueExpression,
          };
    }
    case "location-equal": {
      const leftType = input.types.resolveSelectedValue(
        source.leftExpression,
        source.leftType,
        sourceFile,
      );
      const rightType = input.types.resolveSelectedValue(
        source.rightExpression,
        source.rightType,
        sourceFile,
      );
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
      };
    }
  }
}

function isCsharpTypedLocationEqualityOperand(
  operandType: TargetTypeRef | undefined,
  pointeeType: TargetTypeRef,
): boolean {
  if (isCsharpRuntimeUndefinedTargetType(operandType)) {
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
