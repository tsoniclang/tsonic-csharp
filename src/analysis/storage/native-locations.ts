import type { Node, SourceFile } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpMemoryAnalysisHost, CsharpMemoryOutcome } from "../../policy/model/memory.js";
import type { CsharpNativeCellIdentity, CsharpNativeLocationReceiver, CsharpNativeLocationSelection, CsharpNativeManagedAddress } from "../../target-model/records/native/native-locations.js";
import type { CsharpStorageClassifications } from "../../target-model/records/storage/storage.js";
import type { CsharpAssignmentLocation } from "../../target-model/operations/assignment-locations.js";
import type { TargetTypeRef } from "../../target-model/types/native-type-data.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import { isCsharpValueTypeTargetType } from "../../target-model/types/identity.js";
import { represented, sourceOutcome } from "../../policy/types/source-type-flow/representation-results.js";
import { selectCsharpNativeRefReturn } from "../operations/typed-locations.js";
import { selectCsharpTargetElement, selectCsharpTargetProperty } from "../operations/members/selected-members.js";
import { selectCsharpShapeMemberByOrigins } from "../objects/shapes/member-origins.js";

type PhysicalStorage = Pick<CsharpStorageClassifications,
  "nativeBacking" | "nativeField" | "nativeArray" | "nativeModuleField" | "storageType">;
type Outcome = CsharpMemoryOutcome<CsharpNativeLocationSelection>;

export function classifyCsharpNativeLocation(input: CsharpMemoryAnalysisHost, expression: Node,
  sourceFile: SourceFile, physical: PhysicalStorage, active = new Set<Node>()): Outcome {
  if (active.has(expression)) return rejected("The selected native storage contains a receiver cycle.");
  active.add(expression);
  try {
    if (input.ast.is.IsParenthesizedExpression(expression)) {
      const nested = input.ast.as.AsParenthesizedExpression(expression)?.Expression;
      return nested === undefined ? rejected("The parenthesized native storage has no operand.")
        : classifyCsharpNativeLocation(input, nested, sourceFile, physical, active);
    }
    const reference = selectCsharpNativeRefReturn(input, expression, sourceFile);
    if (reference.kind !== "represented") return reference;
    if (reference.value.kind === "rejected") return represented(reference.value);
    if (reference.value.kind === "resolved") {
      if (reference.value.returnType === undefined) return rejected("The selected native ref return has no exact physical storage type.");
      return represented(Object.freeze({ ...resolved(expression, reference.value.returnType, "direct",
        reference.value.returnPassing === "byref-readwrite", reference.value.returnPassing), opaque: true as const }));
    }
    const place = sourceOutcome(input.facts.protocols.storage(expression));
    if (place.kind !== "represented") return place;
    if (place.value.kind === "none") return rejected("The expression has no canonical Source storage place.");
    const source = place.value.value;
    if (source.kind === "binding") {
      const type = physical.storageType.get(source.declaration) ?? input.storageTargetType.get(source.declaration);
      if (type === undefined) failTargetAnalysisInvariant("tsonic-csharp",
        "A Native binding location requires its completed canonical declaration slot.", source.declaration);
      const backing = physical.nativeBacking.get(source.declaration);
      if (backing !== undefined) return targetTypeRefEquals(input.typeIdentity, backing.pointeeType, type)
        ? represented(resolved(expression, type, "direct", source.writable, undefined, undefined,
          Object.freeze({ kind: "local", layout: backing })))
        : rejected("Native backing must retain the finalized physical pointee carrier.");
      if (physical.nativeArray.get(expression) !== undefined || physical.nativeArray.get(source.declaration) !== undefined) {
        return represented(resolved(expression, type, "direct", source.writable));
      }
      const local = input.ast.is.IsParameterDeclaration(source.declaration) ||
        (input.ast.is.IsBindingElement(source.declaration) || input.ast.is.IsVariableDeclaration(source.declaration)) &&
        (!isModuleBinding(input, source.declaration) || physical.nativeModuleField.get(source.declaration));
      return represented(resolved(expression, type, "direct", source.writable, local ? "byref-readwrite" : undefined));
    }
    if (source.kind === "pointer") return rejected("The pointer place has no admitted Native ref-return operation.");
    const receiver = input.nativeValue(source.receiver.occurrence);
    if (receiver.kind !== "represented") return receiver;
    const valueReceiver = isCsharpValueTypeTargetType(receiver.value);
    const assignment: CsharpAssignmentLocation = valueReceiver ? "unsupported" : "reference-receiver";
    if (source.kind === "element" && receiver.value.kind === "array") {
      const type = receiver.value.element;
      const backing = physical.nativeArray.get(expression);
      if (backing !== undefined) {
        if (backing.kind !== "element") return represented(resolved(expression, type, assignment, source.writable));
        return targetTypeRefEquals(input.typeIdentity, backing.layout.pointeeType, type)
          ? represented(resolved(expression, type, assignment, source.writable, undefined, undefined,
            Object.freeze({ kind: "element", backing })))
          : rejected("A native array cell must retain its finalized physical pointee carrier.");
      }
      return represented(resolved(expression, type, assignment, source.writable, source.writable ? "byref-readwrite" : "byref-readonly"));
    }
    const selected = input.ast.is.IsElementAccessExpression(expression) ? selectCsharpTargetElement(input, expression, sourceFile)
      : selectCsharpTargetProperty(input, expression, sourceFile);
    if (selected.kind === "source-refused" || selected.kind === "native-refused" || selected.kind === "provider-refused") return selected;
    if (selected.kind === "rejected") return Object.freeze({ kind: "provider-refused", diagnostic: selected.diagnostic });
    if (selected.kind !== "resolved" && selected.kind !== "source-owned" && selected.kind !== "project-indexer") {
      return rejected("The storage place has no exact selected Native member or index relation.");
    }
    if (selected.source.optionalChain || selected.source.chainContinuation) return rejected("An optional member access is not a Native storage address.");
    let type: TargetTypeRef;
    let field = false;
    let readonly = !source.writable;
    let isStatic = false;
    let nativeCell: CsharpNativeCellIdentity | undefined;
    if (selected.kind === "resolved") {
      if (selected.targetMember.returnType === undefined) return rejected("The actual Native member has no physical value slot.");
      type = selected.targetMember.returnType;
      field = selected.targetMember.kind === "field";
      readonly ||= selected.targetMember.readonly === true;
      isStatic = selected.receiver.kind === "none";
    } else if (selected.kind === "project-indexer") type = selected.valueType;
    else {
      const shape = input.objectShapes.resolveTarget(receiver.value);
      if (shape === undefined) failTargetAnalysisInvariant("tsonic-csharp",
        "A project member location requires its completed canonical Native object declaration.", expression);
      const use = sourceOutcome(input.facts.objects.use(expression));
      if (use.kind !== "represented") return use;
      const origins = use.value.arms.flatMap(arm => arm.kind === "member" ? [...arm.origins, ...arm.readOrigins, ...arm.writeOrigins] : []);
      const member = selectCsharpShapeMemberByOrigins(shape, origins);
      if (member === undefined) return rejected("All original Source member facets must select one actual Native declaration.");
      const emission = input.objectMembers.objectMember.get(shape, member);
      if (emission === undefined) failTargetAnalysisInvariant("tsonic-csharp",
        "A project member location requires its completed canonical physical declaration.", expression);
      const declaration = emission.declaration;
      if (!("type" in declaration)) return rejected("The selected Native method has no data storage slot.");
      type = declaration.type;
      field = declaration.kind === "field";
      readonly ||= member.readonly === true;
      const backing = physical.nativeField.get(shape.targetType, member.targetName);
      if (backing !== undefined) {
        if (!targetTypeRefEquals(input.typeIdentity, backing.layout.pointeeType, type)) return rejected("A native field cell must retain its finalized physical pointee carrier.");
        nativeCell = Object.freeze({ kind: "field", backing });
      }
    }
    if (nativeCell !== undefined) return represented(resolved(expression, type, assignment, source.writable, undefined, undefined, nativeCell));
    if (isStatic || !valueReceiver) return represented(resolved(expression, type, isStatic ? "direct" : assignment,
      source.writable, field ? readonly ? "byref-readonly" : "byref-readwrite" : undefined));
    const owner = classifyCsharpNativeLocation(input, source.receiver.occurrence, sourceFile, physical, active);
    if (owner.kind !== "represented") return owner;
    if (owner.value.kind !== "resolved" || owner.value.address === undefined || !targetTypeRefEquals(input.typeIdentity, owner.value.storageType, receiver.value)) {
      return represented(resolved(expression, type, assignment, source.writable));
    }
    return represented(resolved(expression, type, assignment, source.writable,
      field ? readonly || owner.value.address.passing === "byref-readonly" ? "byref-readonly" : "byref-readwrite" : undefined,
      Object.freeze({ expression: source.receiver.occurrence, storageType: owner.value.storageType, address: owner.value.address })));
  } finally { active.delete(expression); }
}

function isModuleBinding(input: CsharpMemoryAnalysisHost, declaration: Node): boolean {
  let current: Node | undefined = declaration;
  while (current !== undefined && !input.ast.is.IsVariableStatement(current)) current = input.ast.parent(current);
  const owner = current === undefined ? undefined : input.ast.parent(current);
  return owner !== undefined && input.ast.is.IsSourceFile(owner);
}

function resolved(expression: Node, storageType: TargetTypeRef, assignment: CsharpAssignmentLocation,
  writable: boolean, passing?: CsharpNativeManagedAddress["passing"], receiver?: CsharpNativeLocationReceiver,
  nativeCell?: CsharpNativeCellIdentity): Extract<CsharpNativeLocationSelection, { readonly kind: "resolved" }> {
  return Object.freeze({ kind: "resolved", expression, storageType, assignment, writable,
    ...(receiver === undefined ? {} : { receiver }), ...(nativeCell === undefined ? {} : { nativeCell }),
    ...(passing === undefined ? {} : { address: Object.freeze({ passing, capturedReferenceCrossesSuspension: false as const }) }) });
}

function rejected(reason: string): Outcome { return represented(Object.freeze({ kind: "rejected", reason })); }
