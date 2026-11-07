import type { Node, Type } from "@tsonic/tsts";
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
import type { CsharpPublishedSourceUnionMember } from "../../policy/model/type-resolution.js";

export function selectCsharpPropertyProjections(
  expression: Node,
  source: TargetTypeRef | undefined,
  destination: Type,
  policy: CsharpPolicyContext,
  shapes: Pick<CsharpObjectShapeClassifications, "resolveTarget">,
): readonly CsharpPropertyProjection[] | undefined {
  if (source === undefined) return undefined;
  const semantics = policy.semanticsFor(expression);
  const destinationType = semantics.types.nonNullableType(destination);
  if (destinationType === undefined) return undefined;
  const pending = [source];
  const visited = new Set<string>();
  const projections: CsharpPropertyProjection[] = [];
  let publishedMembers: readonly CsharpPublishedSourceUnionMember[] | undefined;
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
    if (publishedMembers === undefined && leaves !== undefined && leaves.some(leaf => leaf.path.length > 0)) {
      publishedMembers = policy.types.sourceUnionMembers(expression, source);
      if (publishedMembers === undefined) return undefined;
      pending.push(...publishedMembers.map(member => member.carrier));
      continue;
    }
    const shape = shapes.resolveTarget(selected);
    if (shape !== undefined && shape.sourceType === undefined) return undefined;
    const checked = semantics.types.expressionType(expression);
    const presentSource = checked === undefined ? undefined : semantics.types.nonNullableType(checked);
    if (presentSource === undefined) return undefined;
    let sourceType = presentSource;
    if (semantics.types.isUnion(presentSource)) {
      const candidates = publishedMembers?.filter(member => targetTypeRefEquals(member.carrier, selected)) ?? [];
      if (candidates.length !== 1) return undefined;
      const descriptor = candidates[0]!.descriptor;
      const declared = descriptor.kind === "declared"
        ? policy.semanticsFor(descriptor.declaration).declarations.declaredType(descriptor.declaration) : undefined;
      const inventory = shape?.sourceType ?? declared;
      if (inventory === undefined) return undefined;
      sourceType = inventory;
    }
    const correspondence = semantics.types.structuralMembers(sourceType, destinationType, "read");
    if (correspondence.kind !== "available" || correspondence.destination.calls.length !== 0 ||
      correspondence.destination.constructs.length !== 0 || correspondence.destination.indexes.length !== 0) return undefined;
    const members: CsharpPropertyProjectionMember[] = [];
    for (const pair of correspondence.members) {
      if (pair.kind === "absent") {
        if (!pair.destination.property.optional) return undefined;
        continue;
      }
      if (pair.destination.read !== "property" || pair.source.read === "method" || pair.source.read === "unavailable") return undefined;
      const member = shape === undefined ? undefined : resolveCsharpObjectShapeMemberBySelectedSubject(shape,
        [pair.source.property.symbol, ...pair.source.property.rootSymbols, ...pair.source.declarations]);
      if (member?.kind === "resolved") {
        if (member.member.memberKind !== "property") return undefined;
        members.push(member.member);
        continue;
      }
      if (member !== undefined && member.reason !== "not-in-finalized-shape") return undefined;
      const native = resolveCsharpNativePropertyRead(pair.source.declarations, selected, semantics, policy);
      if (native.kind !== "resolved") return undefined;
      members.push(Object.freeze({ native: native.property, sourceName: pair.source.property.name }));
    }
    if (new Set(members.map(member => member.sourceName)).size !== members.length) return undefined;
    projections.push(Object.freeze({ source: selected, members: Object.freeze(members) }));
  }
  return Object.freeze(projections);
}
