import type { Node, SourceFile } from "@tsonic/tsts";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import { selectCsharpAssignmentLocation, type CsharpAssignmentLocation } from "../../policy/operations/operators/assignment-location.js";
import { selectCsharpNativeRefReturn } from "../../policy/operations/typed-locations/typed-locations.js";
import { selectCsharpTargetElement, selectCsharpTargetProperty } from "../../policy/operations/members/index.js";
import { isCsharpValueTypeTargetType } from "../../policy/types/index.js";
import type { CsharpClassPropertyStorage } from "../operations/class-property-storage.js";
import type { CsharpStorageClassifications } from "./model.js";

export interface CsharpNativeManagedAddress {
  readonly passing: "byref-readonly" | "byref-readwrite";
  readonly capturedReferenceCrossesSuspension: false;
}

export interface CsharpNativeLocationReceiver {
  readonly expression: Node;
  readonly storageType: TargetTypeRef;
  readonly address: CsharpNativeManagedAddress;
}

export type CsharpNativeLocationSelection =
  | { readonly kind: "resolved"; readonly expression: Node; readonly storageType: TargetTypeRef;
      readonly assignment: CsharpAssignmentLocation; readonly writable: boolean;
      readonly address?: CsharpNativeManagedAddress; readonly receiver?: CsharpNativeLocationReceiver }
  | { readonly kind: "rejected"; readonly reason: string };

export function classifyCsharpNativeLocation(
  policy: CsharpPolicyContext,
  expression: Node,
  sourceFile: SourceFile,
  classProperty: (declaration: Node) => CsharpClassPropertyStorage | undefined,
  physical: Pick<CsharpStorageClassifications, "nativeBacking" | "nativeField" | "nativeArray" | "type">,
  active = new WeakSet<Node>(),
): CsharpNativeLocationSelection {
  if (active.has(expression)) return rejected("The selected native storage contains a receiver cycle.");
  active.add(expression);
  try {
    if (policy.ast.is.IsParenthesizedExpression(expression)) {
      const nested = policy.ast.as.AsParenthesizedExpression(expression)?.Expression;
      return nested === undefined ? rejected("The parenthesized native storage has no operand.")
        : classifyCsharpNativeLocation(policy, nested, sourceFile, classProperty, physical, active);
    }
    const reference = selectCsharpNativeRefReturn(policy, expression, sourceFile);
    if (reference.kind === "rejected") return reference;
    if (reference.kind === "resolved") return reference.returnType === undefined
      ? rejected("The selected native ref return has no exact physical storage type.")
      : resolved(expression, reference.returnType, "direct", reference.returnPassing === "byref-readwrite", reference.returnPassing);
    const storage = policy.semantics(sourceFile).operations.storage(expression);
    const storageType = physical.type(expression) ??
      (policy.ast.is.IsIdentifier(expression) && storage?.declaration !== undefined
        ? physical.type(storage.declaration) : undefined) ?? policy.types.resolveReadStorage(expression, sourceFile);
    if (storage === undefined || storageType === undefined) return rejected("The expression has no exact native storage and carrier evidence.");
    const assignment = selectCsharpAssignmentLocation(policy, expression, node => policy.types.resolveNode(node, sourceFile));
    if (storage.declaration !== undefined && physical.nativeBacking(storage.declaration) !== undefined ||
      physical.nativeArray(expression) !== undefined) return resolved(expression, storageType, assignment, storage.writable);
    if (policy.ast.is.IsIdentifier(expression)) {
      const declaration = storage.declaration;
      const local = declaration !== undefined &&
        (policy.ast.is.IsParameterDeclaration(declaration) || policy.ast.is.IsBindingElement(declaration) ||
          policy.ast.is.IsVariableDeclaration(declaration) && !isModuleVariable(policy, declaration));
      return resolved(expression, storageType, assignment, storage.writable,
        local ? "byref-readwrite" : undefined);
    }
    if (policy.ast.is.IsPropertyAccessExpression(expression)) {
      const selection = selectCsharpTargetProperty(policy, expression, sourceFile);
      if (selection.kind !== "resolved" && selection.kind !== "source-owned") return rejected("The property has no exact selected native member.");
      if (selection.source.optionalChain) return rejected("An optional property access is not a native storage address.");
      const declaration = selection.source.selectedDeclaration;
      const field = selection.kind === "resolved" ? selection.targetMember.kind === "field"
        : declaration !== undefined && classProperty(declaration) === "field";
      const receiverExpression = selection.source.receiver.expression;
      const receiverType = physical.type(receiverExpression) ??
        policy.types.resolveSelectedValue(receiverExpression, selection.source.receiver.type, sourceFile);
      const shape = receiverType === undefined ? undefined : policy.objectShapes.resolveTarget(receiverType);
      const member = shape?.members.find(candidate => candidate.sourceDeclarations?.includes(declaration!) === true ||
        candidate.sourceSubjects?.includes(declaration!) === true);
      if (shape !== undefined && member !== undefined && physical.nativeField(shape.targetType, member.targetName) !== undefined) {
        return resolved(expression, storageType, assignment, storage.writable);
      }
      const isStatic = selection.kind === "resolved" ? selection.receiver.kind === "none"
        : declaration !== undefined && policy.ast.hasModifierKind(declaration, "static");
      if (!isStatic && receiverType === undefined) return resolved(expression, storageType, assignment, storage.writable);
      if (!isStatic && receiverType !== undefined && isCsharpValueTypeTargetType(receiverType)) {
        const receiver = classifyCsharpNativeLocation(policy, receiverExpression, sourceFile, classProperty, physical, active);
        if (receiver.kind !== "resolved" || receiver.address === undefined ||
          !targetTypeRefEquals(receiver.storageType, receiverType)) return resolved(expression, storageType, assignment, storage.writable);
        return resolved(expression, storageType, assignment, storage.writable,
          field ? storage.writable && receiver.address.passing === "byref-readwrite" ? "byref-readwrite" : "byref-readonly" : undefined,
          Object.freeze({ expression: receiverExpression, storageType: receiver.storageType, address: receiver.address }));
      }
      return resolved(expression, storageType, assignment, storage.writable,
        field ? storage.writable ? "byref-readwrite" : "byref-readonly" : undefined);
    }
    if (policy.ast.is.IsElementAccessExpression(expression)) {
      const selection = selectCsharpTargetElement(policy, expression, sourceFile);
      if (selection.kind !== "resolved" && selection.kind !== "source-owned" && selection.kind !== "project-indexer") return rejected("The element has no exact selected native index relation.");
      if (selection.source.optionalChain) return rejected("An optional element access is not a native storage address.");
      const receiverType = policy.types.resolveSelectedValue(selection.source.receiver.expression, selection.source.receiver.type, sourceFile);
      return resolved(expression, storageType, assignment, storage.writable,
        receiverType?.kind === "array" && targetTypeRefEquals(receiverType.element, storageType)
          ? storage.writable ? "byref-readwrite" : "byref-readonly" : undefined);
    }
    return rejected("The expression is neither native binding storage, a selected member, an array element nor a proven ref return.");
  } finally {
    active.delete(expression);
  }
}

function resolved(expression: Node, storageType: TargetTypeRef, assignment: CsharpAssignmentLocation,
  writable: boolean, passing?: CsharpNativeManagedAddress["passing"], receiver?: CsharpNativeLocationReceiver): CsharpNativeLocationSelection {
  return Object.freeze({ kind: "resolved", expression, storageType, assignment, writable,
    ...(receiver === undefined ? {} : { receiver }),
    ...(passing === undefined ? {} : { address: Object.freeze({ passing, capturedReferenceCrossesSuspension: false as const }) }) });
}

function isModuleVariable(policy: CsharpPolicyContext, declaration: Node): boolean {
  const list = policy.ast.parent(declaration);
  const statement = list === undefined ? undefined : policy.ast.parent(list);
  const parent = statement === undefined ? undefined : policy.ast.parent(statement);
  return list !== undefined && policy.ast.is.IsVariableDeclarationList(list) && statement !== undefined &&
    policy.ast.is.IsVariableStatement(statement) && parent !== undefined && policy.ast.is.IsSourceFile(parent);
}

function rejected(reason: string): CsharpNativeLocationSelection { return { kind: "rejected", reason }; }
