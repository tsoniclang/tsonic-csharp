import type {
  Node,
  SourceFile,
  Type,
} from "@tsonic/tsts";
import {
  AsVariableDeclaration,
} from "@tsonic/target-api/source";
import type {
  CsharpPolicyContext,
} from "../../context.js";
import {
  selectCsharpTargetCall,
  selectCsharpTargetElement,
  selectCsharpTargetProperty,
} from "../../members/index.js";
import {
  csharpRuntimeLocationPointee,
  csharpRuntimeLocationTargetType,
  getCsharpDelegateSignature,
  isCsharpRuntimeUndefinedTargetType,
  targetTypeRefEquals,
  targetTypeRefKey,
  type CsharpTargetMember,
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
      readonly location: CsharpTypedLocationOperand;
    }
  | {
      readonly kind: "location-store";
      readonly call: Node;
      readonly pointeeType: TargetTypeRef;
      readonly locationType: TargetTypeRef;
      readonly location: CsharpTypedLocationOperand;
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

export type CsharpTypedLocationOperand =
  | {
      readonly kind: "runtime-location";
      readonly expression: Node;
    }
  | {
      readonly kind: "native-ref-return";
      readonly expression: Node;
      readonly targetIdentity: string;
      readonly returnPassing: "byref-readwrite" | "byref-readonly";
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
  const nativeLocation = source.kind === "location-load" ||
      source.kind === "location-store"
    ? selectCsharpNativeRefReturn(input, source.locationExpression, sourceFile)
    : undefined;
  if (nativeLocation?.kind === "rejected") {
    return rejected(source.kind, nativeLocation.reason);
  }
  const pointeeType = input.types.resolveTypedLocationOperationPointee(
    source,
    sourceFile,
  ) ?? (source.explicitPointeeTypeNode === undefined &&
      nativeLocation?.kind === "resolved"
    ? nativeLocation.returnType
    : undefined);
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
      const location = selectCsharpTypedLocationOperand(
        input,
        source.locationExpression,
        source.locationType,
        pointeeType,
        locationType,
        sourceFile,
        nativeLocation,
      );
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
            location: location.location,
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

type CsharpTypedLocationOperandSelection =
  | {
      readonly kind: "resolved";
      readonly location: CsharpTypedLocationOperand;
    }
  | { readonly kind: "rejected"; readonly reason: string };

function selectCsharpTypedLocationOperand(
  input: CsharpPolicyContext,
  expression: Node,
  sourceLocationType: Type,
  pointeeType: TargetTypeRef,
  locationType: TargetTypeRef,
  sourceFile: SourceFile,
  preselectedNative?: CsharpNativeRefReturnSelection,
): CsharpTypedLocationOperandSelection {
  const native = preselectedNative ?? selectCsharpNativeRefReturn(
    input,
    expression,
    sourceFile,
  );
  if (native.kind === "rejected") {
    return native;
  }
  if (native.kind === "resolved") {
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
  const selectedLocationType = input.types.resolveSelectedValue(
    expression,
    sourceLocationType,
    sourceFile,
  );
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

export type CsharpNativeRefReturnSelection =
  | {
      readonly kind: "resolved";
      readonly targetIdentity: string;
      readonly returnPassing: "byref-readwrite" | "byref-readonly";
      readonly returnType: TargetTypeRef | undefined;
    }
  | { readonly kind: "not-native" }
  | { readonly kind: "rejected"; readonly reason: string };

export function selectCsharpNativeRefReturn(
  input: CsharpPolicyContext,
  expression: Node,
  sourceFile: SourceFile,
  visited: WeakSet<Node> = new WeakSet<Node>(),
): CsharpNativeRefReturnSelection {
  if (visited.has(expression)) {
    return {
      kind: "rejected",
      reason: "A C# native ref-return alias contains a declaration cycle.",
    };
  }
  visited.add(expression);
  if (input.ast.is.IsIdentifier(expression)) {
    const declaration = input.navigation.referenceFor(expression)?.declaration;
    if (
      declaration === undefined ||
      !input.ast.is.IsVariableDeclaration(declaration) ||
      input.ast.variableDeclarationKind(declaration) !== "const"
    ) {
      return { kind: "not-native" };
    }
    const initializer = AsVariableDeclaration(input.ast, declaration)?.Initializer;
    return initializer === undefined
      ? { kind: "not-native" }
      : selectCsharpNativeRefReturn(input, initializer, sourceFile, visited);
  }
  if (input.ast.is.IsCallExpression(expression)) {
    const selection = selectCsharpTargetCall(input, expression, sourceFile);
    if (selection.kind === "resolved" && selection.call.origin === "provider") {
      return nativeRefReturnFromMember(
        selection.call.targetMember,
        selection.source.optionalChain,
      );
    }
    if (selection.kind === "source-owned") {
      const calleeType = input.types.resolveSelectedValue(
        selection.source.sourceCallee.expression,
        selection.source.sourceCallee.type,
        sourceFile,
      );
      const signature = getCsharpDelegateSignature(calleeType);
      if (signature?.returnPassing !== undefined && calleeType !== undefined) {
        if (selection.source.optionalChain) {
          return {
            kind: "rejected",
            reason:
              `The selected C# ref-return delegate '${targetTypeRefKey(calleeType)}' cannot be invoked through an optional chain.`,
          };
        }
        return {
          kind: "resolved",
          targetIdentity: `delegate:${targetTypeRefKey(calleeType)}`,
          returnPassing: signature.returnPassing,
          returnType: signature.returnType,
        };
      }
    }
    return { kind: "not-native" };
  }
  if (input.ast.is.IsPropertyAccessExpression(expression)) {
    const selection = selectCsharpTargetProperty(input, expression, sourceFile);
    if (selection.kind !== "resolved" || selection.origin !== "provider") {
      return { kind: "not-native" };
    }
    return nativeRefReturnFromMember(
      selection.targetMember,
      selection.source.optionalChain,
    );
  }
  if (input.ast.is.IsElementAccessExpression(expression)) {
    const selection = selectCsharpTargetElement(input, expression, sourceFile);
    if (selection.kind !== "resolved" || selection.origin !== "provider") {
      return { kind: "not-native" };
    }
    return nativeRefReturnFromMember(
      selection.targetMember,
      selection.source.optionalChain,
    );
  }
  return { kind: "not-native" };
}

function nativeRefReturnFromMember(
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
