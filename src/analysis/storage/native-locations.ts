import type { CsharpNativeCellIdentity, CsharpNativeLocationReceiver, CsharpNativeLocationSelection, CsharpNativeManagedAddress } from "../../target-model/records/native/native-locations.js";
import type { Node } from "@tsonic/tsts";
import { readCsharpSourceField } from "../../source/extension/markers.js";
import { sourceParameterIsProperty, type SourceElementAccessRecord, type SourceMemberAccessSelection } from "@tsonic/target-api/source";

/** The member declaration a property or element access selects (published selection), if it selects one member. */
function csharpSelectedMemberDeclaration(source: SourceMemberAccessSelection | SourceElementAccessRecord): Node | undefined {
  const selected = source.selected;
  return selected.kind !== "member" ? undefined : "declarations" in selected ? selected.declarations[0] : selected.declaration;
}
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import { selectCsharpAssignmentLocation } from "../operations/assignment-location.js";
import { type CsharpAssignmentLocation } from "../../target-model/operations/assignment-locations.js";
import { selectCsharpNativeRefReturn } from "../operations/typed-locations.js";
import { selectCsharpTargetProperty } from "../operations/members/selected-members.js";
import { selectCsharpTargetElement } from "../operations/members/selected-members.js";
import { isCsharpValueTypeTargetType } from "../../policy/types/index.js";
import type { CsharpClassPropertyStorage } from "../../target-model/records/storage/class-property-storage.js";
import type { CsharpStorageClassifications } from "../../target-model/records/storage/storage.js";

export function classifyCsharpNativeLocation(
  policy: CsharpPolicyContext,
  expression: Node,
  classProperty: (declaration: Node) => CsharpClassPropertyStorage | undefined,
  physical: Pick<CsharpStorageClassifications, "nativeBacking" | "nativeField" | "nativeArray" | "nativeModuleField" | "storageType">,
  readStorage: (expression: Node) => TargetTypeRef | undefined,
  active = new WeakSet<Node>(),
): CsharpNativeLocationSelection {
  if (active.has(expression)) return rejected("The selected native storage contains a receiver cycle.");
  active.add(expression);
  try {
    if (policy.ast.is.IsParenthesizedExpression(expression)) {
      const nested = policy.ast.as.AsParenthesizedExpression(expression)?.Expression;
      return nested === undefined ? rejected("The parenthesized native storage has no operand.")
        : classifyCsharpNativeLocation(policy, nested, classProperty, physical, readStorage, active);
    }
    const reference = selectCsharpNativeRefReturn(policy, expression);
    if (reference.kind === "rejected") return reference;
    if (reference.kind === "resolved") return reference.returnType === undefined
      ? rejected("The selected native ref return has no exact physical storage type.")
      : Object.freeze({ ...resolved(expression, reference.returnType, "direct", reference.returnPassing === "byref-readwrite", reference.returnPassing), opaque: true as const });
    const storage = policy.facts.selections.storage(expression);
    const storageType = physical.storageType.get(expression) ??
      (policy.ast.is.IsIdentifier(expression) && storage?.declaration !== undefined
        ? physical.storageType.get(storage.declaration) : undefined) ?? readStorage(expression);
    if (storage === undefined || storageType === undefined) return rejected("The expression has no exact native storage and carrier evidence.");
    const assignment = selectCsharpAssignmentLocation(policy, expression, node => {
      const represented = policy.types.value(node);
      return represented.kind === "csharp-refused" ? undefined : represented;
    });
    const localBacking = storage.declaration === undefined ? undefined : physical.nativeBacking.get(storage.declaration);
    if (localBacking !== undefined) return targetTypeRefEquals(localBacking.pointeeType, storageType)
      ? resolved(expression, storageType, assignment, storage.writable, undefined, undefined,
        Object.freeze({ kind: "local", layout: localBacking }))
      : rejected("Native backing must retain the finalized physical pointee carrier.");
    const arrayBacking = physical.nativeArray.get(expression);
    if (arrayBacking !== undefined) return arrayBacking.kind === "element"
      ? targetTypeRefEquals(arrayBacking.layout.pointeeType, storageType)
        ? resolved(expression, storageType, assignment, storage.writable, undefined, undefined,
          Object.freeze({ kind: "element", backing: arrayBacking }))
        : rejected("A native array cell must retain its finalized physical pointee carrier.")
      : resolved(expression, storageType, assignment, storage.writable);
    if (policy.ast.is.IsIdentifier(expression)) {
      const declaration = storage.declaration;
      const local = declaration !== undefined &&
        (policy.ast.is.IsParameterDeclaration(declaration) ||
          (policy.ast.is.IsBindingElement(declaration) || policy.ast.is.IsVariableDeclaration(declaration)) &&
          (!policy.facts.navigation.scopes.isModuleScoped(declaration) || physical.nativeModuleField.get(declaration)));
      return resolved(expression, storageType, assignment, storage.writable,
        local ? "byref-readwrite" : undefined);
    }
    const property = policy.ast.is.IsPropertyAccessExpression(expression);
    const element = policy.ast.is.IsElementAccessExpression(expression);
    const memberSelection = property ? selectCsharpTargetProperty(policy, expression)
      : element ? selectCsharpTargetElement(policy, expression) : undefined;
    const memberDeclaration = memberSelection?.kind === "resolved" || memberSelection?.kind === "source-owned"
      ? csharpSelectedMemberDeclaration(memberSelection.source) : undefined;
    const namedElement = element && memberDeclaration !== undefined && (
      policy.ast.is.IsPropertyDeclaration(memberDeclaration) || policy.ast.is.IsPropertySignatureDeclaration(memberDeclaration) ||
      policy.ast.is.IsGetAccessorDeclaration(memberDeclaration) || policy.ast.is.IsSetAccessorDeclaration(memberDeclaration) ||
      sourceParameterIsProperty(policy.ast, memberDeclaration) || readCsharpSourceField(policy.sourceFacts, [memberDeclaration]) !== undefined);
    if (property || namedElement) {
      const selection = memberSelection;
      if (selection?.kind !== "resolved" && selection?.kind !== "source-owned") return rejected("The property has no exact selected native member.");
      if ("optionalChain" in selection.source ? selection.source.optionalChain
        : policy.ast.as.AsElementAccessExpression(expression)?.QuestionDotToken !== undefined)
        return rejected("An optional property access is not a native storage address.");
      const declaration = csharpSelectedMemberDeclaration(selection.source);
      const classStorage = declaration === undefined ? undefined : classProperty(declaration);
      const sourceField = declaration === undefined ? undefined : readCsharpSourceField(policy.sourceFacts, [declaration]);
      const moduleField = declaration !== undefined && physical.nativeModuleField.get(declaration);
      const field = selection.kind === "resolved" ? selection.targetMember.kind === "field"
        : classStorage?.kind === "field" || sourceField !== undefined || moduleField;
      const nativeReadonly = selection.kind === "resolved" || sourceField !== undefined
        ? !storage.writable : !moduleField && classStorage?.readonly !== false;
      const receiverExpression = selection.source.receiver;
      const representedReceiver = policy.types.value(receiverExpression);
      const receiverType = physical.storageType.get(receiverExpression) ??
        (representedReceiver.kind === "csharp-refused" ? undefined : representedReceiver);
      const shape = receiverType === undefined ? undefined : policy.objectShapes.resolveTarget(receiverType);
      const member = shape?.members.find(candidate => candidate.sourceDeclarations?.includes(declaration!) === true ||
        candidate.sourceSubjects?.includes(declaration!) === true);
      const fieldBacking = shape === undefined || member === undefined ? undefined : physical.nativeField.get(shape.targetType, member.targetName);
      if (fieldBacking !== undefined) {
        return targetTypeRefEquals(fieldBacking.layout.pointeeType, storageType)
          ? resolved(expression, storageType, assignment, storage.writable, undefined, undefined,
            Object.freeze({ kind: "field", backing: fieldBacking }))
          : rejected("A native field cell must retain its finalized physical pointee carrier.");
      }
      const isStatic = selection.kind === "resolved" ? selection.receiver.kind === "none"
        : moduleField || declaration !== undefined && policy.ast.hasModifierKind(declaration, "static");
      if (!isStatic && receiverType === undefined) return resolved(expression, storageType, assignment, storage.writable);
      if (!isStatic && receiverType !== undefined && isCsharpValueTypeTargetType(receiverType)) {
        const receiver = classifyCsharpNativeLocation(policy, receiverExpression, classProperty, physical, readStorage, active);
        if (receiver.kind !== "resolved" || receiver.address === undefined ||
          !targetTypeRefEquals(receiver.storageType, receiverType)) return resolved(expression, storageType, assignment, storage.writable);
        return resolved(expression, storageType, assignment, storage.writable,
          field ? !nativeReadonly && receiver.address.passing === "byref-readwrite" ? "byref-readwrite" : "byref-readonly" : undefined,
          Object.freeze({ expression: receiverExpression, storageType: receiver.storageType, address: receiver.address }));
      }
      return resolved(expression, storageType, assignment, storage.writable,
        field ? nativeReadonly ? "byref-readonly" : "byref-readwrite" : undefined);
    }
    if (element) {
      const selection = memberSelection;
      if (selection?.kind !== "resolved" && selection?.kind !== "source-owned" && selection?.kind !== "project-indexer") return rejected("The element has no exact selected native index relation.");
      if (policy.ast.as.AsElementAccessExpression(expression)?.QuestionDotToken !== undefined)
        return rejected("An optional element access is not a native storage address.");
      const representedReceiver = policy.types.value(selection.source.receiver);
      const receiverType = representedReceiver.kind === "csharp-refused" ? undefined : representedReceiver;
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
  writable: boolean, passing?: CsharpNativeManagedAddress["passing"], receiver?: CsharpNativeLocationReceiver,
  nativeCell?: CsharpNativeCellIdentity): CsharpNativeLocationSelection {
  return Object.freeze({ kind: "resolved", expression, storageType, assignment, writable,
    ...(receiver === undefined ? {} : { receiver }),
    ...(nativeCell === undefined ? {} : { nativeCell }),
    ...(passing === undefined ? {} : { address: Object.freeze({ passing, capturedReferenceCrossesSuspension: false as const }) }) });
}

function rejected(reason: string): CsharpNativeLocationSelection { return { kind: "rejected", reason }; }
