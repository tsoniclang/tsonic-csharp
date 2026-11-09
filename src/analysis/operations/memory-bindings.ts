import type { Node } from "@tsonic/tsts";
import type { SourceMemoryFieldBinding } from "@tsonic/target-api/source";
import type { SourceStorageUnresolved } from "@tsonic/target-api/analysis";
import type { CsharpMemoryBindingSelection } from "../../target-model/records/storage/memory-bindings.js";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { CsharpObjectShapeMemberFact } from "../../target-model/types/model.js";
import type { CsharpRepresentationOutcome } from "../../target-model/types/representation.js";
import type { TargetTypeRef } from "../../target-model/types/native-type-data.js";
import { csharpRuntimeLocationTargetType, isCsharpEmptyObjectTargetType } from "../../target-model/types/carriers/runtime-carriers.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import { represented, sourceOutcome } from "../../policy/types/source-type-flow/representation-results.js";
import { csharpPointerStorageDomainRejection } from "./pointers/storage-domain.js";

type UnresolvedMemory = Extract<SourceStorageUnresolved, { readonly kind: "unresolved" }>;

export function selectCsharpMemoryBinding(
  input: CsharpPolicyContext,
  node: Node,
): CsharpRepresentationOutcome<CsharpMemoryBindingSelection | undefined> | UnresolvedMemory {
  const queries = input.sourceStorage.memory.memoryBindings;
  const field = queries.field(node, input.sourceStorage.emptyBindings);
  if (field.kind === "refused") return Object.freeze({ kind: "source-refused", refusal: field });
  if (field.kind === "unresolved") return field;
  const reject = (reason: string): CsharpRepresentationOutcome<CsharpMemoryBindingSelection> =>
    represented(Object.freeze({ kind: "rejected", reason }));
  if (field.value.kind === "present") {
    const binding = field.value.value;
    const pointee = representedPointee(input, binding);
    if (pointee.kind !== "represented") return pointee;
    const type = csharpRuntimeLocationTargetType(pointee.value);
    const pointer = input.nativeValue(binding.pointer.occurrence);
    if (pointer.kind !== "represented") return pointer;
    if (!targetTypeRefEquals(type, pointer.value)) {
      return reject("The selected location and bound field have different C# pointee carriers.");
    }
    const domain = csharpPointerStorageDomainRejection(input, binding.pointer.occurrence, pointee.value, binding.bindings);
    if (domain.kind !== "represented") return domain;
    return domain.value === undefined
      ? represented(Object.freeze({ kind: "field", type, expression: binding.pointer.occurrence }))
      : reject(domain.value);
  }
  const record = queries.record(node, input.sourceStorage.emptyBindings);
  if (record.kind === "refused") return Object.freeze({ kind: "source-refused", refusal: record });
  if (record.kind === "unresolved") return record;
  if (record.value.kind === "none") return represented(undefined);
  const operation = record.value.value;
  const evidence = sourceOutcome(input.representation.source.substitute(operation.layout.source, operation.typeBindings));
  if (evidence.kind !== "represented") return evidence;
  const selectedType = input.representation.represent(evidence.value, "storage", node);
  if (selectedType.kind !== "represented") return selectedType;
  const type = selectedType.value.carrier;
  const selectedShape = input.objectShapes.resolveEvidence(evidence.value, type, node);
  if (selectedShape.kind !== "represented") return selectedShape;
  const shape = isCsharpEmptyObjectTargetType(type) && operation.fields.length === 0
    ? Object.freeze({ targetType: type, members: Object.freeze([]) })
    : selectedShape.value.kind === "present" ? selectedShape.value.value : undefined;
  if (shape === undefined || shape.members.length !== operation.fields.length || !targetTypeRefEquals(type, shape.targetType)) {
    return reject("The bound record requires one exact complete C# structural carrier.");
  }
  const used = new Set<CsharpObjectShapeMemberFact>();
  const fields: { readonly expression: Node; readonly member: CsharpObjectShapeMemberFact }[] = [];
  for (const entry of operation.fields) {
    const binding = entry.binding;
    const owner = sourceOutcome(input.representation.source.substitute(binding.field.owner, binding.typeBindings));
    if (owner.kind !== "represented") return owner;
    let member: CsharpObjectShapeMemberFact | undefined;
    for (const origin of binding.field.member.origins) {
      const selection = input.objectShapes.resolveMember(owner.value, type, origin, binding.field.selection);
      if (selection.kind !== "represented") return selection;
      if (selection.value.kind === "none" || member !== undefined && member !== selection.value.value) {
        return reject("The bound field has no unique selected C# storage member.");
      }
      member = selection.value.value;
    }
    if (member === undefined || used.has(member) || member.bound !== true || member.memberKind !== "property" ||
      member.optional || member.accessor !== undefined) {
      return reject("The selected record member has no finalized live-location storage.");
    }
    const pointee = representedPointee(input, binding);
    if (pointee.kind !== "represented") return pointee;
    const pointer = input.nativeValue(binding.pointer.occurrence);
    if (pointer.kind !== "represented") return pointer;
    if (!targetTypeRefEquals(pointee.value, member.type) ||
      !targetTypeRefEquals(pointer.value, csharpRuntimeLocationTargetType(member.type))) {
      return reject("The bound member and supplied location have different C# pointee carriers.");
    }
    const domain = csharpPointerStorageDomainRejection(input, binding.pointer.occurrence, member.type, binding.bindings);
    if (domain.kind !== "represented") return domain;
    if (domain.value !== undefined) return reject(domain.value);
    used.add(member);
    fields.push(Object.freeze({ expression: entry.expression, member }));
  }
  return represented(Object.freeze({ kind: "record", type, shape, fields: Object.freeze(fields) }));
}

function representedPointee(
  input: Pick<CsharpPolicyContext, "representation">,
  binding: SourceMemoryFieldBinding,
): CsharpRepresentationOutcome<TargetTypeRef> {
  const evidence = sourceOutcome(input.representation.source.substitute(binding.pointee, binding.typeBindings));
  if (evidence.kind !== "represented") return evidence;
  const selected = input.representation.represent(evidence.value, "storage", binding.occurrence);
  return selected.kind === "represented" ? represented(selected.value.carrier) : selected;
}
