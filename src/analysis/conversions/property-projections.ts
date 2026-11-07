import type { Node } from "@tsonic/tsts";
import { sourceTypeDescriptorStructure, type SourceObjectMember, type SourceTypeDescriptor } from "@tsonic/target-api/source";
import { sourceValueType } from "../program/source-facts.js";
import type { CsharpPropertyProjection, CsharpPropertyProjectionMember } from "../../target-model/records/objects/property-projections.js";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { CsharpObjectShapeClassifications } from "../../target-model/records/objects/object-shapes.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import {
  getCsharpNullableElementTargetType,
  isCsharpAbsenceTargetType,
  isCsharpJsValueTargetType,
  isCsharpRecordDictionaryTargetType,
  isCsharpStringTargetType,
  resolveCsharpObjectShapeMemberBySelectedSubject,
  targetTypeRefEquals,
  targetTypeRefKey,
} from "../../target-model/types/index.js";
import { csharpUnionLeaves } from "../../target-model/types/union-relations.js";
import { resolveCsharpNativePropertyRead } from "../objects/native-property-reads.js";
import { csharpPresentSourceArms, csharpSinglePresentSourceArm } from "../objects/shapes/present-arms.js";

/**
 * Native property projections of a value into a structural destination (a TsValue `properties` parameter).
 * Source meaning comes from published facts: the value descriptor, its closed sum, and the Host object members of
 * source and destination. Native only selects the physical path: each source carrier maps to the Host arm it
 * represents positionally (R6), and each destination member to its native shape member or native property read.
 */
export function selectCsharpPropertyProjections(
  expression: Node,
  source: TargetTypeRef | undefined,
  destination: SourceTypeDescriptor,
  policy: CsharpPolicyContext,
  shapes: Pick<CsharpObjectShapeClassifications, "resolveTarget">,
): readonly CsharpPropertyProjection[] | undefined {
  if (source === undefined) return undefined;
  const { facts } = policy;
  // The present arms come from the Host closed sum (one reader, A11: void is published as absence; R3 #13).
  const destinationType = csharpSinglePresentSourceArm(facts, destination, expression);
  if (destinationType === undefined) return undefined;
  const destinationStructure = sourceTypeDescriptorStructure(destinationType);
  if (destinationStructure.kind !== "shape" || destinationStructure.calls.length !== 0 ||
    destinationStructure.constructs.length !== 0 || destinationStructure.indexes.length !== 0) return undefined;
  const destinationMembers = facts.objects.members(destinationType);
  if (!Array.isArray(destinationMembers)) return undefined;
  const sourceArms = csharpPresentSourceArms(facts, sourceValueType(facts, expression), expression);
  if (sourceArms.length === 0) return undefined;
  const pending = [source];
  const visited = new Set<string>();
  const projections: CsharpPropertyProjection[] = [];
  while (pending.length > 0) {
    const selected = pending.pop()!;
    const key = targetTypeRefKey(selected);
    if (visited.has(key)) continue;
    visited.add(key);
    if (isCsharpAbsenceTargetType(selected) || isCsharpJsValueTargetType(selected)) continue;
    if (isCsharpRecordDictionaryTargetType(selected)) {
      if (selected.typeArguments?.length !== 2 || !isCsharpStringTargetType(selected.typeArguments[0]) ||
        !isCsharpJsValueTargetType(selected.typeArguments[1])) return undefined;
      continue;
    }
    const present = getCsharpNullableElementTargetType(selected);
    if (present !== undefined) {
      pending.push(present);
      continue;
    }
    const leaves = csharpUnionLeaves(selected, policy.typeDefinitions);
    if (leaves !== undefined && leaves.some(leaf => leaf.path.length > 0)) {
      pending.push(...leaves.map(leaf => leaf.carrier));
      continue;
    }
    const shape = shapes.resolveTarget(selected);
    // The Host arms this physical carrier stores. Arms whose carriers coincide (Q73: one storage arm, several roles)
    // share one projection, so every coincident arm must give the same physical members.
    const candidates = sourceArms.length === 1 ? sourceArms : sourceArms.filter(arm => {
      const represented = policy.types.represent(arm, expression, "value");
      return represented.kind !== "csharp-refused" && targetTypeRefEquals(represented, selected);
    });
    if (candidates.length === 0) return undefined;
    let members: readonly CsharpPropertyProjectionMember[] | undefined;
    for (const sourceType of candidates) {
      const projected = projectArmMembers(sourceType, selected, shape, destinationMembers, policy);
      if (projected === undefined || members !== undefined && !projectionMembersEqual(members, projected)) return undefined;
      members = projected;
    }
    projections.push(Object.freeze({ source: selected, members: members! }));
  }
  return Object.freeze(projections);
}

/**
 * The physical members one source arm supplies for the destination members. Source and destination members correspond
 * by their Host member key (`objects.member(type, key)`, R3 #14); a static member of that key is no instance member.
 */
function projectArmMembers(
  sourceType: SourceTypeDescriptor,
  selected: TargetTypeRef,
  shape: ReturnType<Pick<CsharpObjectShapeClassifications, "resolveTarget">["resolveTarget"]>,
  destinationMembers: readonly SourceObjectMember[],
  policy: CsharpPolicyContext,
): readonly CsharpPropertyProjectionMember[] | undefined {
  const { facts } = policy;
  const sourceMembers = facts.objects.members(sourceType);
  if (!Array.isArray(sourceMembers)) return undefined;
  const members: CsharpPropertyProjectionMember[] = [];
  for (const target of destinationMembers) {
    const sourceMember = facts.objects.member(sourceType, target.key);
    if (sourceMember === undefined || sourceMember.static) {
      if (!target.optional) return undefined;
      continue;
    }
    if (target.kind !== "property" || sourceMember.kind === "method") return undefined;
    const member = shape === undefined ? undefined
      : resolveCsharpObjectShapeMemberBySelectedSubject(shape, sourceMember.declarations);
    if (member?.kind === "resolved") {
      if (member.member.memberKind !== "property") return undefined;
      members.push(member.member);
      continue;
    }
    if (member !== undefined && member.reason !== "not-in-finalized-shape") return undefined;
    const native = resolveCsharpNativePropertyRead(sourceMember.declarations, selected, policy);
    if (native.kind !== "resolved") return undefined;
    members.push(Object.freeze({ native: native.property, sourceName: sourceMember.name }));
  }
  if (new Set(members.map(member => member.sourceName)).size !== members.length) return undefined;
  return Object.freeze(members);
}

/** Coincident arms project the same physical path: the same shape member, or the same native member read. */
function projectionMembersEqual(left: readonly CsharpPropertyProjectionMember[],
  right: readonly CsharpPropertyProjectionMember[]): boolean {
  return left.length === right.length && left.every((member, index) => {
    const other = right[index]!;
    if (member === other) return true;
    if (member.native === undefined || other.native === undefined || member.sourceName !== other.sourceName) return false;
    const [selected, candidate] = [member.native.member, other.native.member];
    return selected.id === candidate.id && targetTypeRefEquals(selected.returnType, candidate.returnType) &&
      (selected.declaringType === undefined ? candidate.declaringType === undefined
        : candidate.declaringType !== undefined && targetTypeRefEquals(selected.declaringType, candidate.declaringType));
  });
}
