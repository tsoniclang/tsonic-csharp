import type { Node, SourceFile } from "@tsonic/tsts";
import type { SourceTypeEvidence, SourceValueOperand } from "@tsonic/target-api/source";
import type { CsharpMemoryAnalysisHost, CsharpMemoryOutcome } from "../../policy/model/memory.js";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { CsharpNativeRefReturnSelection, CsharpTypedLocationOperationSelection } from "../../target-model/records/storage/typed-locations.js";
import type { CsharpTypedLocationStorageSelection } from "../../target-model/records/storage/typed-location-storage.js";
import type { CsharpNativeCallableApplication } from "../../target-model/conversions/selection.js";
import type { TargetTypeRef } from "../../target-model/types/native-type-data.js";
import { csharpRuntimeLocationTargetType, isCsharpAbsenceTargetType } from "../../target-model/types/carriers/runtime-carriers.js";
import { isCsharpNullableReferenceTargetType } from "../../target-model/types/carriers/nullable.js";
import { represented, sourceOutcome, nativeRepresentationFailure } from "../../policy/types/source-type-flow/representation-results.js";
import { selectCsharpNativeTypedLocationOperation, nativeRefReturnFromMember } from "../../policy/operations/typed-locations/selection.js";
import { selectCsharpTypedLocationStorage } from "../storage/typed-locations.js";
import { selectCsharpMemoryRuntimeDefinition, selectCsharpMemoryRuntimeMember } from "./pointers/runtime-definitions.js";
import { selectCsharpProviderCall } from "./members/calls/selection.js";
import { selectCsharpProviderProperty } from "./members/property-selection.js";
import { selectCsharpProviderElement } from "./members/element-selection.js";

export function csharpTypedLocationLoweringRefusal(operation: string, reason: string): string {
  return `C# '${operation}' lowering requires one exact finalized typed-location operation. ${reason}`;
}

export function selectCsharpTypedLocationOperation(input: CsharpMemoryAnalysisHost, node: Node,
  sourceFile: SourceFile): CsharpMemoryOutcome<CsharpTypedLocationOperationSelection> {
  const selected = sourceOutcome(input.facts.protocols.pointerOperation(node));
  if (selected.kind !== "represented") return selected;
  if (selected.value.kind === "none" || selected.value.value.family !== "typed-location") {
    return represented(Object.freeze({ kind: "not-typed-location" }));
  }
  const source = selected.value.value;
  if (source.occurrence !== node) throw new TypeError("A typed location must retain its identical original Source occurrence.");
  const pointee = input.representation.represent(source.pointee, "storage", node);
  if (pointee.kind !== "represented") return pointee;
  const definition = selectCsharpMemoryRuntimeDefinition(input, "Location", node);
  if (definition.kind !== "represented") return definition;
  const carriers = new Map<Node, TargetTypeRef>();
  let native: CsharpNativeRefReturnSelection | undefined;
  let storage: CsharpTypedLocationStorageSelection | undefined;
  let sourcePointee: TargetTypeRef | undefined;
  let runtime: CsharpNativeCallableApplication | undefined;
  if (source.operation === "load" || source.operation === "store") {
    const selected = selectCsharpNativeRefReturn(input, source.pointer.occurrence, sourceFile);
    if (selected.kind !== "represented") return selected;
    native = selected.value;
  }
  if (source.operation === "address-of") {
    const selected = selectCsharpTypedLocationStorage(input, source.storage.occurrence,
      pointee.value.carrier, sourceFile, new Set<Node>());
    if (selected.kind !== "represented") return selected;
    storage = selected.value;
  }
  const operands: readonly SourceValueOperand[] = source.operation === "address-of" ? []
    : source.operation === "allocate" ? [source.initial]
      : source.operation === "equal-pointer" ? [source.left, source.right]
        : source.operation === "bind-pointer" ? [source.identity, source.read, source.write]
          : source.operation === "project-pointer" ? [source.pointer, source.fromSource, source.toSource]
            : source.operation === "view" ? [source.pointer, source.read, source.write]
              : source.operation === "store" ? [source.pointer, source.value] : [source.pointer];
  for (const operand of operands) {
    if ((source.operation === "load" || source.operation === "store") && native?.kind === "resolved" && operand === source.pointer) continue;
    if (source.operation === "store" && native?.kind === "resolved" && native.returnPassing === "byref-readonly" && operand === source.value) continue;
    const selected = input.nativeValue(operand.occurrence);
    if (selected.kind !== "represented") return selected;
    carriers.set(operand.occurrence, selected.value);
  }
  if (source.operation === "bind-pointer" || source.operation === "project-pointer" || source.operation === "view") {
    let arguments_: readonly TargetTypeRef[] = [];
    let method: string;
    if (source.operation === "bind-pointer") method = "Bind";
    else {
      const selected = representSourcePointee(input, source.sourcePointee, node);
      if (selected.kind !== "represented") return selected;
      sourcePointee = selected.value;
      arguments_ = [sourcePointee];
      const pointer = carriers.get(source.pointer.occurrence);
      const optional = source.operation === "view" ? source.optional
        : pointer !== undefined && (isCsharpAbsenceTargetType(pointer) || isCsharpNullableReferenceTargetType(pointer));
      method = source.operation === "view" ? optional ? "ViewOptional" : "View" : optional ? "ProjectOptional" : "Project";
    }
    const selected = selectCsharpMemoryRuntimeMember(input,
      csharpRuntimeLocationTargetType(pointee.value.carrier, definition.value), method, arguments_, node);
    if (selected.kind !== "represented") return selected;
    runtime = selected.value;
  }
  return represented(selectCsharpNativeTypedLocationOperation(input.typeIdentity, source, pointee.value.carrier,
    definition.value, carriers, native, storage, sourcePointee, runtime));
}

function representSourcePointee(input: CsharpPolicyContext, evidence: SourceTypeEvidence,
  site: Node): CsharpMemoryOutcome<TargetTypeRef> {
  const selected = input.representation.represent(evidence, "storage", site);
  return selected.kind !== "represented" ? selected : represented(selected.value.carrier);
}

export function selectCsharpNativeRefReturn(input: CsharpPolicyContext, expression: Node,
  sourceFile: SourceFile, visited: Set<Node> = new Set<Node>()): CsharpMemoryOutcome<CsharpNativeRefReturnSelection> {
  if (visited.has(expression)) return represented(Object.freeze({ kind: "rejected",
    reason: "A C# native ref-return alias contains a declaration cycle." }));
  visited.add(expression);
  if (input.ast.is.IsIdentifier(expression)) {
    const declaration = input.facts.navigation.sourceReferenceFor(expression)?.declaration;
    if (declaration === undefined || !input.ast.is.IsVariableDeclaration(declaration) ||
      input.ast.variableDeclarationKind(declaration) !== "const") return represented(Object.freeze({ kind: "not-native" }));
    const initializer = input.ast.as.AsVariableDeclaration(declaration)?.Initializer;
    return initializer === undefined ? represented(Object.freeze({ kind: "not-native" }))
      : selectCsharpNativeRefReturn(input, initializer, sourceFile, visited);
  }
  if (input.ast.is.IsCallExpression(expression)) {
    const selection = selectCsharpProviderCall(input, expression, sourceFile);
    if (selection.kind === "resolved") return represented(nativeRefReturnFromMember(selection.call.targetMember, selection.source.optionalCall));
    if (selection.kind === "source-refused" || selection.kind === "native-refused" || selection.kind === "provider-refused") return selection;
    if (selection.kind === "rejected") return Object.freeze({ kind: "provider-refused", diagnostic: selection.diagnostic });
    if (selection.kind !== "not-provider") return nativeRepresentationFailure(expression,
      "CSHARP_NATIVE_REF_RETURN_NOT_PROVEN", selection.reason);
    const callee = input.nativeValue(selection.source.callee.occurrence);
    if (callee.kind !== "represented") return callee;
    const member = input.nativeDelegates.member(callee.value, selection.source.identity.signature);
    if (member?.signature.returnPassing === undefined) return represented(Object.freeze({ kind: "not-native" }));
    return selection.source.optionalCall ? represented(Object.freeze({ kind: "rejected",
      reason: "The exact Native ref-return callable cannot be invoked through an optional call." }))
      : represented(Object.freeze({ kind: "resolved", targetIdentity: member.name,
        returnPassing: member.signature.returnPassing, returnType: member.signature.returnType }));
  }
  if (input.ast.is.IsPropertyAccessExpression(expression)) {
    const selection = selectCsharpProviderProperty(input, expression, sourceFile);
    if (selection.kind === "resolved") return represented(nativeRefReturnFromMember(selection.property.targetMember,
      selection.property.source.optionalChain || selection.property.source.chainContinuation));
    if (selection.kind === "source-refused" || selection.kind === "native-refused" || selection.kind === "provider-refused") return selection;
    if (selection.kind === "rejected") return Object.freeze({ kind: "provider-refused", diagnostic: selection.diagnostic });
    return selection.kind === "not-provider" ? represented(Object.freeze({ kind: "not-native" }))
      : nativeRepresentationFailure(expression, "CSHARP_NATIVE_REF_RETURN_NOT_PROVEN", selection.reason);
  }
  if (input.ast.is.IsElementAccessExpression(expression)) {
    const selection = selectCsharpProviderElement(input, expression, sourceFile);
    if (selection.kind === "resolved") return represented(nativeRefReturnFromMember(selection.element.targetMember,
      selection.element.source.optionalChain || selection.element.source.chainContinuation));
    if (selection.kind === "source-refused" || selection.kind === "native-refused" || selection.kind === "provider-refused") return selection;
    if (selection.kind === "rejected") return Object.freeze({ kind: "provider-refused", diagnostic: selection.diagnostic });
    return selection.kind === "not-provider" ? represented(Object.freeze({ kind: "not-native" }))
      : nativeRepresentationFailure(expression, "CSHARP_NATIVE_REF_RETURN_NOT_PROVEN", selection.reason);
  }
  return represented(Object.freeze({ kind: "not-native" }));
}
