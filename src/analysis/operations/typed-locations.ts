import type { CsharpNativeRefReturnSelection, CsharpTypedLocationOperationSelection } from "../../target-model/records/storage/typed-locations.js";
import type { Node } from "@tsonic/tsts";
import { AsVariableDeclaration, type SourceTypeDescriptor } from "@tsonic/target-api/source";
import { isCsharpRefusal, type CsharpRepresentation } from "../../representation/index.js";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import { selectCsharpTargetCall, selectCsharpTargetElement, selectCsharpTargetProperty } from "./members/selected-members.js";
import {
  csharpRuntimeLocationPointee, getCsharpDelegateSignature, targetTypeRefEquals, targetTypeRefKey, type TargetTypeRef,
} from "../../policy/types/index.js";
import { readCsharpSourceTypedLocationOperation } from "../../source/extension/typed-locations.js";

import { selectCsharpTypedLocationStorage } from "../storage/typed-locations.js";


import { selectCsharpNativeTypedLocationOperation, nativeRefReturnFromMember } from "../../policy/operations/typed-locations/selection.js";

/** The user-facing refusal of a typed-location operation the policy rejected. */
export function csharpTypedLocationLoweringRefusal(operation: string, reason: string): string {
  return `C# '${operation}' lowering requires one exact finalized typed-location operation. ${reason}`;
}

export function selectCsharpTypedLocationOperation(
  input: CsharpPolicyContext, node: Node,
): CsharpTypedLocationOperationSelection {
  const source = readCsharpSourceTypedLocationOperation(input.ast, input.facts, node);
  if (source === undefined) return { kind: "not-typed-location" };
  const native = source.kind === "location-load" || source.kind === "location-store"
    ? selectCsharpNativeRefReturn(input, source.locationExpression) : undefined;
  if (native?.kind === "rejected") return { kind: "rejected", operation: source.kind, reason: native.reason,
    ...(native.code === undefined ? {} : { code: native.code }) };
  // A native ref-return location without an authored pointee type takes the ref-return's own pointee.
  const pointee = source.explicitPointeeTypeNode === undefined && native?.kind === "resolved" ? native.returnType
    : input.types.resolveTypedLocationOperationPointee(source);
  if (pointee === undefined) return { kind: "rejected", operation: source.kind, code: "CSHARP_TYPED_LOCATION_POINTEE",
    reason: "The exact selected pointee type has no closed C# representation." };
  if (isCsharpRefusal(pointee)) return { kind: "rejected", operation: source.kind, reason: pointee.message, code: pointee.code };
  const carriers = new Map<Node, TargetTypeRef>();
  let refusal: Extract<CsharpRepresentation, { readonly kind: "csharp-refused" }> | undefined;
  const retain = (expression: Node, type: CsharpRepresentation): void => {
    if (isCsharpRefusal(type)) refusal ??= type;
    else carriers.set(expression, type);
  };
  // Every typed-location operand carrier is its published descriptor represented at that operand (R2).
  const selected = (expression: Node, type: SourceTypeDescriptor): void =>
    retain(expression, input.types.represent(type, expression, "value"));
  let storage: import("../../target-model/records/storage/typed-location-storage.js").CsharpTypedLocationStorageSelection | undefined;
  switch (source.kind) {
    case "location-view": {
      const arguments_ = input.ast.arguments(node);
      if (source.call !== node || arguments_.length !== 3 || arguments_[0] !== source.locationExpression ||
        arguments_[1] !== source.readExpression || arguments_[2] !== source.writeExpression) {
        return { kind: "rejected", operation: source.kind, reason: "Pointer views require the exact checked base, read and write arguments." };
      }
      selected(source.locationExpression, source.locationType);
      if (csharpRuntimeLocationPointee(carriers.get(source.locationExpression)) === undefined) {
        retain(source.call, input.types.represent(source.sourcePointeeType, source.call, "type-argument"));
      }
      break;
    }
    case "location-project":
      selected(source.locationExpression, source.locationType);
      if (source.explicitSourcePointeeTypeNode !== undefined) retain(source.explicitSourcePointeeTypeNode,
        input.types.represent(source.sourcePointeeType, source.explicitSourcePointeeTypeNode, "type-argument"));
      break;
    case "location-hash": selected(source.locationExpression, source.locationType); break;
    case "location-bind": selected(source.identityExpression, source.identityType); break;
    case "location-address": {
      const type = input.types.readStorage(source.storageExpression);
      retain(source.storageExpression, type);
      if (!isCsharpRefusal(type) && targetTypeRefEquals(type, pointee)) storage = selectCsharpTypedLocationStorage(
        input, source.storageExpression, type, new WeakSet<Node>(), source.storageDeclaration);
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
  if (refusal !== undefined) return { kind: "rejected", operation: source.kind, reason: refusal.message, code: refusal.code };
  return selectCsharpNativeTypedLocationOperation(source, pointee, carriers, native, storage);
}

export function selectCsharpNativeRefReturn(
  input: CsharpPolicyContext,
  expression: Node,
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
    const target = input.facts.navigation.identity.target(expression);
    const declaration = target?.project === true ? target.declaration : undefined;
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
      : selectCsharpNativeRefReturn(input, initializer, visited);
  }
  if (input.ast.is.IsCallExpression(expression)) {
    const selection = selectCsharpTargetCall(input, expression);
    if (selection.kind === "resolved" && selection.call.origin === "provider") {
      return nativeRefReturnFromMember(
        selection.call.targetMember,
        selection.source.optionalChain,
      );
    }
    if (selection.kind === "source-owned") {
      const callee = input.types.value(selection.source.callee);
      const calleeType = isCsharpRefusal(callee) ? undefined : callee;
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
    const selection = selectCsharpTargetProperty(input, expression);
    if (selection.kind !== "resolved" || selection.origin !== "provider") {
      return { kind: "not-native" };
    }
    return nativeRefReturnFromMember(
      selection.targetMember,
      selection.source.optionalChain,
    );
  }
  if (input.ast.is.IsElementAccessExpression(expression)) {
    const selection = selectCsharpTargetElement(input, expression);
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
