import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  CsharpTranslationContext,
} from "../../translate/context/index.js";
import {
  selectCsharpTargetProperty,
} from "../members/index.js";
import {
  csharpRuntimeLocationTargetType,
  isCsharpValueTypeTargetType,
  targetTypeRefEquals,
  type TargetTypeRef,
} from "../types/index.js";
import {
  readCsharpSourceTypedLocationOperation,
} from "./source-typed-locations.js";

export type CsharpTypedLocationStorage =
  | {
      readonly kind: "direct-storage";
      readonly expression: Node;
      readonly valueType: TargetTypeRef;
    }
  | {
      readonly kind: "reference-property-storage";
      readonly expression: Node;
      readonly valueType: TargetTypeRef;
    }
  | {
      readonly kind: "value-property-storage";
      readonly expression: Node;
      readonly valueType: TargetTypeRef;
      readonly receiverStorage: CsharpTypedLocationStorage;
    }
  | {
      readonly kind: "reference-element-storage";
      readonly expression: Node;
      readonly valueType: TargetTypeRef;
    }
  | {
      readonly kind: "value-element-storage";
      readonly expression: Node;
      readonly valueType: TargetTypeRef;
      readonly receiverStorage: CsharpTypedLocationStorage;
    };

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
  | "location-store";

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
    };

export function selectCsharpTypedLocationOperation(
  input: CsharpTranslationContext,
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
  }
}

type CsharpTypedLocationStorageSelection =
  | { readonly kind: "resolved"; readonly storage: CsharpTypedLocationStorage }
  | { readonly kind: "rejected"; readonly reason: string };

function selectCsharpTypedLocationStorage(
  input: CsharpTranslationContext,
  expression: Node,
  valueType: TargetTypeRef,
  sourceFile: SourceFile,
  active: WeakSet<Node>,
): CsharpTypedLocationStorageSelection {
  if (active.has(expression)) {
    return storageRejected(
      "The selected writable storage contains a cyclic receiver relation.",
    );
  }
  active.add(expression);
  try {
    if (input.ast.is.IsIdentifier(expression)) {
      return {
        kind: "resolved",
        storage: { kind: "direct-storage", expression, valueType },
      };
    }
    if (input.ast.is.IsPropertyAccessExpression(expression)) {
      return selectCsharpPropertyStorage(
        input,
        expression,
        valueType,
        sourceFile,
        active,
      );
    }
    if (input.ast.is.IsElementAccessExpression(expression)) {
      return selectCsharpElementStorage(
        input,
        expression,
        valueType,
        sourceFile,
        active,
      );
    }
    return storageRejected(
      `Writable source storage kind '${input.ast.kindName(expression)}' has no C# typed-location operation.`,
    );
  } finally {
    active.delete(expression);
  }
}

function selectCsharpPropertyStorage(
  input: CsharpTranslationContext,
  expression: Node,
  valueType: TargetTypeRef,
  sourceFile: SourceFile,
  active: WeakSet<Node>,
): CsharpTypedLocationStorageSelection {
  const selection = selectCsharpTargetProperty(input, expression, sourceFile);
  if (selection.kind !== "resolved" && selection.kind !== "source-owned") {
    const reason = selection.kind === "rejected"
      ? selection.diagnostic.message
      : selection.reason;
    return storageRejected(
      `The selected writable property has no exact C# member relation: ${reason}`,
    );
  }
  const source = selection.source;
  if (!source.writable || source.optionalChain) {
    return storageRejected(
      "The selected property is not an exact writable C# member location.",
    );
  }
  const isStatic = selection.kind === "resolved"
    ? selection.receiver.kind === "none"
    : source.selectedDeclaration !== undefined &&
      input.ast.hasModifierKind(source.selectedDeclaration, "static");
  if (isStatic) {
    return {
      kind: "resolved",
      storage: { kind: "direct-storage", expression, valueType },
    };
  }
  const receiverType = input.types.resolveSelectedValue(
    source.receiver.expression,
    source.receiver.type,
    sourceFile,
  );
  const receiverKind = classifyCsharpStorageReceiver(receiverType);
  if (receiverType === undefined || receiverKind === "unknown") {
    return storageRejected(
      "The selected property receiver is neither a proven C# reference nor value type.",
    );
  }
  if (receiverKind === "reference") {
    return {
      kind: "resolved",
      storage: {
        kind: "reference-property-storage",
        expression,
        valueType,
      },
    };
  }
  const receiverStorage = selectWritableReceiverStorage(
    input,
    source.receiver.expression,
    receiverType,
    sourceFile,
    active,
  );
  return receiverStorage.kind === "rejected"
    ? receiverStorage
    : {
        kind: "resolved",
        storage: {
          kind: "value-property-storage",
          expression,
          valueType,
          receiverStorage: receiverStorage.storage,
        },
      };
}

function selectCsharpElementStorage(
  input: CsharpTranslationContext,
  expression: Node,
  valueType: TargetTypeRef,
  sourceFile: SourceFile,
  active: WeakSet<Node>,
): CsharpTypedLocationStorageSelection {
  const source = input.semantics(sourceFile)
    .getResolvedElementAccessInfo(expression);
  if (source === undefined || !source.writable || source.optionalChain) {
    return storageRejected(
      "The selected element is not an exact writable C# index location.",
    );
  }
  const receiverType = input.types.resolveSelectedValue(
    source.receiver.expression,
    source.receiver.type,
    sourceFile,
  );
  const receiverKind = classifyCsharpStorageReceiver(receiverType);
  if (receiverType === undefined || receiverKind === "unknown") {
    return storageRejected(
      "The selected element receiver is neither a proven C# reference nor value type.",
    );
  }
  if (receiverKind === "reference") {
    return {
      kind: "resolved",
      storage: {
        kind: "reference-element-storage",
        expression,
        valueType,
      },
    };
  }
  const receiverStorage = selectWritableReceiverStorage(
    input,
    source.receiver.expression,
    receiverType,
    sourceFile,
    active,
  );
  return receiverStorage.kind === "rejected"
    ? receiverStorage
    : {
        kind: "resolved",
        storage: {
          kind: "value-element-storage",
          expression,
          valueType,
          receiverStorage: receiverStorage.storage,
        },
      };
}

function selectWritableReceiverStorage(
  input: CsharpTranslationContext,
  receiver: Node,
  receiverType: TargetTypeRef,
  sourceFile: SourceFile,
  active: WeakSet<Node>,
): CsharpTypedLocationStorageSelection {
  const storage = input.semantics(sourceFile).getResolvedStorageInfo(receiver);
  if (storage === undefined || !storage.writable) {
    return storageRejected(
      "A value-type storage receiver has no exact writable owner location.",
    );
  }
  const selectedStorageType = input.types.resolveSelectedValue(
    storage.storageExpression,
    storage.type,
    sourceFile,
  );
  if (
    selectedStorageType === undefined ||
    !targetTypeRefEquals(selectedStorageType, receiverType)
  ) {
    return storageRejected(
      "A value-type storage receiver and its writable owner do not have one exact C# target type.",
    );
  }
  return selectCsharpTypedLocationStorage(
    input,
    storage.storageExpression,
    receiverType,
    sourceFile,
    active,
  );
}

function classifyCsharpStorageReceiver(
  type: TargetTypeRef | undefined,
): "reference" | "value" | "unknown" {
  if (type === undefined) {
    return "unknown";
  }
  if (isCsharpValueTypeTargetType(type)) {
    return "value";
  }
  switch (type.kind) {
    case "array":
    case "target-named":
      return "reference";
    case "source-primitive":
    case "tuple":
    case "pointer":
    case "function-pointer":
      return "value";
    case "source-global":
    case "type-parameter":
    case "opaque":
    case "associated-type":
    case "lifetime":
    case "target-specific":
      return "unknown";
  }
}

function rejected(
  operation: CsharpTypedLocationOperationKind,
  reason: string,
): CsharpTypedLocationOperationSelection {
  return { kind: "rejected", operation, reason };
}

function storageRejected(reason: string): CsharpTypedLocationStorageSelection {
  return { kind: "rejected", reason };
}
