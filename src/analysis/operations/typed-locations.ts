import type { CsharpNativeRefReturnSelection, CsharpTypedLocationOperationSelection } from "../../target-model/records/typed-locations.js";
import type { Node, SourceFile, Type } from "@tsonic/tsts";
import { AsVariableDeclaration } from "@tsonic/target-api/source";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import { selectCsharpTargetCall, selectCsharpTargetElement, selectCsharpTargetProperty } from "./members/selected-members.js";
import {
  csharpRuntimeLocationPointee, getCsharpDelegateSignature, targetTypeRefEquals, targetTypeRefKey, type TargetTypeRef,
} from "../../policy/types/index.js";
import { readCsharpSourceTypedLocationOperation } from "../../source/extension/typed-locations.js";

import { selectCsharpTypedLocationStorage } from "../storage/typed-locations.js";


import { selectCsharpNativeTypedLocationOperation, nativeRefReturnFromMember } from "../../policy/operations/typed-locations/selection.js";

export function selectCsharpTypedLocationOperation(
  input: CsharpPolicyContext, node: Node, sourceFile: SourceFile,
): CsharpTypedLocationOperationSelection {
  const source = readCsharpSourceTypedLocationOperation(input.sourceFacts, node);
  if (source === undefined) return { kind: "not-typed-location" };
  const native = source.kind === "location-load" || source.kind === "location-store"
    ? selectCsharpNativeRefReturn(input, source.locationExpression, sourceFile) : undefined;
  if (native?.kind === "rejected") return { kind: "rejected", operation: source.kind, reason: native.reason };
  const pointee = input.types.resolveTypedLocationOperationPointee(source, sourceFile) ??
    (source.explicitPointeeTypeNode === undefined && native?.kind === "resolved" ? native.returnType : undefined);
  if (pointee === undefined) return { kind: "rejected", operation: source.kind,
    reason: "The exact selected pointee type has no closed C# representation." };
  const carriers = new Map<Node, TargetTypeRef>();
  const retain = (expression: Node, type: TargetTypeRef | undefined): void => {
    if (type !== undefined) carriers.set(expression, type);
  };
  const selected = (expression: Node, type: Type): void =>
    retain(expression, input.types.resolveSelectedValue(expression, type, sourceFile));
  let storage: import("../../target-model/records/typed-location-storage.js").CsharpTypedLocationStorageSelection | undefined;
  switch (source.kind) {
    case "location-view": {
      const arguments_ = input.ast.arguments(node);
      if (source.call !== node || arguments_.length !== 3 || arguments_[0] !== source.locationExpression ||
        arguments_[1] !== source.readExpression || arguments_[2] !== source.writeExpression) {
        return { kind: "rejected", operation: source.kind, reason: "Pointer views require the exact checked base, read and write arguments." };
      }
      selected(source.locationExpression, source.locationType);
      if (csharpRuntimeLocationPointee(carriers.get(source.locationExpression)) === undefined) {
        retain(source.call, input.types.resolveType(source.sourcePointeeType, sourceFile));
      }
      break;
    }
    case "location-project":
      selected(source.locationExpression, source.locationType);
      if (source.explicitSourcePointeeTypeNode !== undefined) retain(source.explicitSourcePointeeTypeNode,
        input.types.resolveSelectedType(source.explicitSourcePointeeTypeNode, source.sourcePointeeType, sourceFile));
      break;
    case "location-hash": selected(source.locationExpression, source.locationType); break;
    case "location-bind": selected(source.identityExpression, source.identityType); break;
    case "location-address": {
      const type = input.types.resolveReadStorage(source.storageExpression, sourceFile);
      retain(source.storageExpression, type);
      if (type !== undefined && targetTypeRefEquals(type, pointee)) storage = selectCsharpTypedLocationStorage(
        input, source.storageExpression, type, sourceFile, new WeakSet<Node>(), source.storageDeclaration);
      break;
    }
    case "location-allocate": selected(source.initialExpression, source.initialType); break;
    case "location-load": case "location-store":
      if (native?.kind !== "resolved") selected(source.locationExpression, source.locationType);
      if (source.kind === "location-store" &&
        !(native?.kind === "resolved" && native.returnPassing === "byref-readonly")) {
        selected(source.valueExpression, source.valueType);
      }
      break;
    case "location-equal":
      selected(source.leftExpression, source.leftType); selected(source.rightExpression, source.rightType); break;
  }
  return selectCsharpNativeTypedLocationOperation(source, pointee, carriers, native, storage);
}

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
