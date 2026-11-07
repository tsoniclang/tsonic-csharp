import { pointerOperationFactKey } from "@tsonic/tsts";
import { tsonicPointerViewFactKey } from "@tsonic/source-core/facts";
import type { ExtensionFactSubject, Node, ReadonlySourceFactResolver } from "@tsonic/tsts";
import type { SourceTypeDescriptor } from "@tsonic/target-api/source";

// Typed-location (pointer) operations as published by the Host pointer facts. Every type is the Host descriptor
// (pointer-operation and pointer-view facts carry SourceTypeDescriptor, request R-F5-A1); no checker Type (I1, I2).

interface CsharpSourceTypedLocationOperationBase {
  readonly call: Node;
  readonly pointeeType: SourceTypeDescriptor;
  readonly explicitPointeeTypeNode?: Node;
  readonly resultType: SourceTypeDescriptor;
}

export type CsharpSourceTypedLocationOperation =
  | CsharpSourceTypedLocationOperationBase & {
      readonly kind: "location-address";
      readonly storageExpression: Node;
      readonly storageType: SourceTypeDescriptor;
      readonly storageDeclaration?: Node;
      readonly locationIdentity: Node;
    }
  | CsharpSourceTypedLocationOperationBase & {
      readonly kind: "location-allocate";
      readonly initialExpression: Node;
      readonly initialType: SourceTypeDescriptor;
      readonly locationIdentity: Node;
    }
  | CsharpSourceTypedLocationOperationBase & {
      readonly kind: "location-load";
      readonly locationExpression: Node;
      readonly locationType: SourceTypeDescriptor;
    }
  | CsharpSourceTypedLocationOperationBase & {
      readonly kind: "location-store";
      readonly locationExpression: Node;
      readonly locationType: SourceTypeDescriptor;
      readonly valueExpression: Node;
      readonly valueType: SourceTypeDescriptor;
    }
  | CsharpSourceTypedLocationOperationBase & {
      readonly kind: "location-equal";
      readonly leftExpression: Node;
      readonly leftType: SourceTypeDescriptor;
      readonly rightExpression: Node;
      readonly rightType: SourceTypeDescriptor;
    }
  | CsharpSourceTypedLocationOperationBase & {
      readonly kind: "location-hash";
      readonly locationExpression: Node;
      readonly locationType: SourceTypeDescriptor;
    }
  | CsharpSourceTypedLocationOperationBase & {
      readonly kind: "location-bind";
      readonly identityExpression: Node;
      readonly identityType: SourceTypeDescriptor;
      readonly readExpression: Node;
      readonly readType: SourceTypeDescriptor;
      readonly writeExpression: Node;
      readonly writeType: SourceTypeDescriptor;
    }
  | CsharpSourceTypedLocationOperationBase & {
      readonly kind: "location-view";
      readonly sourcePointeeType: SourceTypeDescriptor;
      readonly locationExpression: Node;
      readonly locationType: SourceTypeDescriptor;
      readonly readExpression: Node;
      readonly readType: SourceTypeDescriptor;
      readonly writeExpression: Node;
      readonly writeType: SourceTypeDescriptor;
      readonly optional: boolean;
    }
  | CsharpSourceTypedLocationOperationBase & {
      readonly kind: "location-project";
      readonly sourcePointeeType: SourceTypeDescriptor;
      readonly explicitSourcePointeeTypeNode?: Node;
      readonly locationExpression: Node;
      readonly locationType: SourceTypeDescriptor;
      readonly fromSourceExpression: Node;
      readonly fromSourceType: SourceTypeDescriptor;
      readonly toSourceExpression: Node;
      readonly toSourceType: SourceTypeDescriptor;
    };

export function readCsharpSourceTypedLocationOperation(
  sourceFacts: ReadonlySourceFactResolver | undefined,
  subject: ExtensionFactSubject | undefined,
): CsharpSourceTypedLocationOperation | undefined {
  const view = sourceFacts?.getFact(subject, tsonicPointerViewFactKey);
  if (view !== undefined) return Object.freeze({
    call: view.call, pointeeType: view.pointeeType,
    ...(view.explicitPointeeTypeNode === undefined ? {} : { explicitPointeeTypeNode: view.explicitPointeeTypeNode }),
    resultType: view.resultType, kind: "location-view", sourcePointeeType: view.sourcePointeeType,
    locationExpression: view.pointerExpression, locationType: view.pointerType,
    readExpression: view.readExpression, readType: view.readType,
    writeExpression: view.writeExpression, writeType: view.writeType, optional: view.optional,
  });
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
