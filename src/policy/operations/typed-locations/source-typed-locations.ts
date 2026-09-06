import {
  pointerOperationFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionFactSubject,
  Node,
  ReadonlySourceFactResolver,
  Symbol,
  Type,
} from "@tsonic/tsts";

interface CsharpSourceTypedLocationOperationBase {
  readonly call: Node;
  readonly pointeeType: Type;
  readonly explicitPointeeTypeNode?: Node;
  readonly resultType: Type;
}

export type CsharpSourceTypedLocationOperation =
  | CsharpSourceTypedLocationOperationBase & {
      readonly kind: "location-address";
      readonly storageExpression: Node;
      readonly storageType: Type;
      readonly storageSymbol?: Symbol;
      readonly storageDeclaration?: Node;
      readonly locationIdentity: Node;
    }
  | CsharpSourceTypedLocationOperationBase & {
      readonly kind: "location-allocate";
      readonly initialExpression: Node;
      readonly initialType: Type;
      readonly locationIdentity: Node;
    }
  | CsharpSourceTypedLocationOperationBase & {
      readonly kind: "location-load";
      readonly locationExpression: Node;
      readonly locationType: Type;
    }
  | CsharpSourceTypedLocationOperationBase & {
      readonly kind: "location-store";
      readonly locationExpression: Node;
      readonly locationType: Type;
      readonly valueExpression: Node;
      readonly valueType: Type;
    }
  | CsharpSourceTypedLocationOperationBase & {
      readonly kind: "location-equal";
      readonly leftExpression: Node;
      readonly leftType: Type;
      readonly rightExpression: Node;
      readonly rightType: Type;
    }
  | CsharpSourceTypedLocationOperationBase & {
      readonly kind: "location-hash";
      readonly locationExpression: Node;
      readonly locationType: Type;
    }
  | CsharpSourceTypedLocationOperationBase & {
      readonly kind: "location-bind";
      readonly identityExpression: Node;
      readonly identityType: Type;
      readonly readExpression: Node;
      readonly readType: Type;
      readonly writeExpression: Node;
      readonly writeType: Type;
    }
  | CsharpSourceTypedLocationOperationBase & {
      readonly kind: "location-project";
      readonly sourcePointeeType: Type;
      readonly explicitSourcePointeeTypeNode?: Node;
      readonly locationExpression: Node;
      readonly locationType: Type;
      readonly fromSourceExpression: Node;
      readonly fromSourceType: Type;
      readonly toSourceExpression: Node;
      readonly toSourceType: Type;
    };

export function readCsharpSourceTypedLocationOperation(
  sourceFacts: ReadonlySourceFactResolver | undefined,
  subject: ExtensionFactSubject | undefined,
): CsharpSourceTypedLocationOperation | undefined {
  const operation = sourceFacts?.getFact(subject, pointerOperationFactKey);
  if (operation === undefined) {
    return undefined;
  }
  const base = {
    call: operation.call,
    pointeeType: operation.pointeeType,
    ...(operation.explicitPointeeTypeNode === undefined
      ? {}
      : { explicitPointeeTypeNode: operation.explicitPointeeTypeNode }),
    resultType: operation.resultType,
  };
  switch (operation.operation) {
    case "address-of":
      return Object.freeze({
        ...base,
        kind: "location-address",
        storageExpression: operation.storageExpression,
        storageType: operation.storageType,
        ...(operation.storageSymbol === undefined
          ? {}
          : { storageSymbol: operation.storageSymbol }),
        ...(operation.storageDeclaration === undefined
          ? {}
          : { storageDeclaration: operation.storageDeclaration }),
        locationIdentity: operation.locationIdentity,
      });
    case "allocate":
      return Object.freeze({
        ...base,
        kind: "location-allocate",
        initialExpression: operation.initialExpression,
        initialType: operation.initialType,
        locationIdentity: operation.locationIdentity,
      });
    case "load":
      return Object.freeze({
        ...base,
        kind: "location-load",
        locationExpression: operation.pointerExpression,
        locationType: operation.pointerType,
      });
    case "store":
      return Object.freeze({
        ...base,
        kind: "location-store",
        locationExpression: operation.pointerExpression,
        locationType: operation.pointerType,
        valueExpression: operation.valueExpression,
        valueType: operation.valueType,
      });
    case "equal-pointer":
      return Object.freeze({
        ...base,
        kind: "location-equal",
        leftExpression: operation.leftExpression,
        leftType: operation.leftType,
        rightExpression: operation.rightExpression,
        rightType: operation.rightType,
      });
    case "hash-pointer":
      return Object.freeze({
        ...base,
        kind: "location-hash",
        locationExpression: operation.pointerExpression,
        locationType: operation.pointerType,
      });
    case "bind-pointer":
      return Object.freeze({
        ...base,
        kind: "location-bind",
        identityExpression: operation.identityExpression,
        identityType: operation.identityType,
        readExpression: operation.readExpression,
        readType: operation.readType,
        writeExpression: operation.writeExpression,
        writeType: operation.writeType,
      });
    case "project-pointer":
      return Object.freeze({
        ...base,
        kind: "location-project",
        sourcePointeeType: operation.sourcePointeeType,
        ...(operation.explicitSourcePointeeTypeNode === undefined
          ? {}
          : { explicitSourcePointeeTypeNode: operation.explicitSourcePointeeTypeNode }),
        locationExpression: operation.pointerExpression,
        locationType: operation.pointerType,
        fromSourceExpression: operation.fromSourceExpression,
        fromSourceType: operation.fromSourceType,
        toSourceExpression: operation.toSourceExpression,
        toSourceType: operation.toSourceType,
      });
  }
}
