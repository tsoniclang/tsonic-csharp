import type { Node } from "@tsonic/tsts";
import { sourceTypeDescriptorStructure, type SourceTypeDescriptor } from "@tsonic/target-api/source";
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

/** The present part of a published descriptor: an optional value, or a sum without its absence arms. */
function presentDescriptor(type: SourceTypeDescriptor): SourceTypeDescriptor | undefined {
  if (type.kind === "optional") return presentDescriptor(type.value);
  if (type.kind === "intrinsic" && (type.intrinsic === "absence" || type.intrinsic === "void")) return undefined;
  if (type.kind !== "union") return type;
  const present = type.types.filter(arm => !(arm.kind === "intrinsic" && (arm.intrinsic === "absence" || arm.intrinsic === "void")));
  return present.length === type.types.length ? type : present.length === 1 ? presentDescriptor(present[0]!)
    : present.length === 0 ? undefined : Object.freeze({ kind: "union" as const, types: Object.freeze(present) });
}

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
  const destinationType = presentDescriptor(destination);
  if (destinationType === undefined) return undefined;
  const destinationStructure = sourceTypeDescriptorStructure(destinationType);
  if (destinationStructure.kind !== "shape" || destinationStructure.calls.length !== 0 ||
    destinationStructure.constructs.length !== 0 || destinationStructure.indexes.length !== 0) return undefined;
  const destinationMembers = facts.objects.members(destinationType);
  if (!Array.isArray(destinationMembers)) return undefined;
  const presentSource = presentDescriptor(sourceValueType(facts, expression));
  if (presentSource === undefined) return undefined;
  const sum = facts.sums.sumOf(presentSource);
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
    let sourceType = presentSource;
    if (sum !== undefined) {
      const candidates = sum.arms.filter(arm => {
        const represented = policy.types.represent(arm.type, expression, "value");
        return represented.kind !== "csharp-refused" && targetTypeRefEquals(represented, selected);
      });
      if (candidates.length !== 1) return undefined;
      sourceType = candidates[0]!.type;
    }
    const sourceMembers = facts.objects.members(sourceType);
    if (!Array.isArray(sourceMembers)) return undefined;
    const members: CsharpPropertyProjectionMember[] = [];
    for (const target of destinationMembers) {
      const matches = sourceMembers.filter(candidate => !candidate.static && candidate.name === target.name);
      if (matches.length === 0) {
        if (!target.optional) return undefined;
        continue;
      }
      const sourceMember = matches[0]!;
      if (matches.length !== 1 || target.kind !== "property" || sourceMember.kind === "method") return undefined;
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
    projections.push(Object.freeze({ source: selected, members: Object.freeze(members) }));
  }
  return Object.freeze(projections);
}
