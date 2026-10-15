import type { Node, Type } from "@tsonic/tsts";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { CsharpObjectShapeClassifications } from "../objects/index.js";
import type { CsharpObjectShapeMemberFact, TargetTypeRef } from "../../target-model/types/model.js";
import {
  getCsharpNullableElementTargetType,
  isCsharpAbsenceTargetType,
  isCsharpJsValueTargetType,
  isCsharpRecordDictionaryTargetType,
  isCsharpStringTargetType,
  resolveCsharpObjectShapeMemberBySelectedSubject,
  targetTypeRefKey,
} from "../../target-model/types/index.js";
import { csharpUnionLeaves } from "../../target-model/types/union-relations.js";

export interface CsharpPropertyProjection {
  readonly source: TargetTypeRef;
  readonly members: readonly CsharpObjectShapeMemberFact[];
}

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
    if (shape?.sourceType === undefined) return undefined;
    const correspondence = semantics.types.structuralMembers(shape.sourceType, destinationType);
    if (correspondence.kind !== "available" || correspondence.destination.calls.length !== 0 ||
      correspondence.destination.constructs.length !== 0 || correspondence.destination.indexes.length !== 0) return undefined;
    const members: CsharpObjectShapeMemberFact[] = [];
    for (const pair of correspondence.members) {
      if (pair.kind === "absent") {
        if (!pair.destination.property.optional) return undefined;
        continue;
      }
      if (pair.destination.read !== "property" || pair.source.read === "method" || pair.source.read === "unavailable") return undefined;
      const member = resolveCsharpObjectShapeMemberBySelectedSubject(shape,
        [pair.source.property.symbol, ...pair.source.property.rootSymbols, ...pair.source.declarations]);
      if (member.kind !== "resolved" || member.member.memberKind !== "property") return undefined;
      members.push(member.member);
    }
    if (new Set(members.map(member => member.sourceName)).size !== members.length) return undefined;
    projections.push(Object.freeze({ source: selected, members: Object.freeze(members) }));
  }
  return Object.freeze(projections);
}
