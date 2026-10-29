import type { Node, Type } from "@tsonic/tsts";
import { sourceBoundTypeRelationship, type SourceFileSemantics } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../../../target-model/types/equality.js";
import { getCsharpRuntimeUnionArms } from "../../../../target-model/types/carriers/runtime-carriers.js";
import { getCsharpNullableElementTargetType } from "../../../../target-model/types/carriers/nullable.js";
import type { CsharpTypeResolutionState } from "./model.js";
import type { CsharpTypeDefinitions } from "../../../../target-model/types/source-union-definitions.js";
import { csharpUnionLeaves } from "../../../../target-model/types/union-relations.js";

interface CsharpSourceUnionMember {
  readonly source: Type;
  readonly carrier: TargetTypeRef;
  readonly physicalCarrier: TargetTypeRef;
  readonly bindings: ReadonlyMap<Node, Type>;
}

export interface CsharpSourceUnionIndex {
  retain(
    carrier: TargetTypeRef | undefined,
    members: readonly { readonly source: Type; readonly carrier: TargetTypeRef }[],
    queries: SourceFileSemantics,
    state: CsharpTypeResolutionState,
    physicalArm: (source: TargetTypeRef, carrier: TargetTypeRef) => TargetTypeRef | undefined,
  ): TargetTypeRef | undefined;
  select(carrier: TargetTypeRef, selected: Type, queries: SourceFileSemantics):
    { readonly kind: "unavailable" | "rejected" } | { readonly kind: "resolved"; readonly carrier: TargetTypeRef };
}

export function createCsharpSourceUnionIndex(definitions?: CsharpTypeDefinitions): CsharpSourceUnionIndex {
  const membersByCarrier = new Map<string, readonly CsharpSourceUnionMember[]>();
  return {
    retain(carrier, members, queries, state, physicalArm) {
      if (carrier === undefined) return undefined;
      const present = getCsharpNullableElementTargetType(carrier) ?? carrier;
      const selectedLeaves = csharpUnionLeaves(present, definitions);
      if (selectedLeaves === undefined && getCsharpRuntimeUnionArms(present, definitions) !== undefined) return carrier;
      const leaves = selectedLeaves ?? [{ carrier: present }];
      const key = targetTypeRefKey(present);
      const entries = [...membersByCarrier.get(key) ?? []];
      const bindings = new Map([...state.sourceBindings ?? []].map(([node, binding]) => [node, binding.sourceType]));
      for (const member of members) {
        const inner = getCsharpNullableElementTargetType(member.carrier) ?? member.carrier;
        const nested = !queries.types.isUnion(member.source) && getCsharpRuntimeUnionArms(inner, definitions) === undefined ? undefined
          : membersByCarrier.get(targetTypeRefKey(inner));
        const sources = queries.types.isUnion(member.source)
          ? queries.types.unionOrIntersectionTypes(member.source) : [member.source];
        const candidates = nested ?? sources.filter(source => !queries.types.isNullish(source))
          .map(source => Object.freeze({ source, carrier: inner, bindings }));
        for (const candidate of candidates) {
          const physicalCarrier = physicalArm(candidate.carrier, present);
          if (physicalCarrier === undefined || !leaves.some(leaf => targetTypeRefEquals(leaf.carrier, physicalCarrier))) continue;
          if (!entries.some(entry => entry.source === candidate.source &&
            targetTypeRefEquals(entry.carrier, candidate.carrier) &&
            targetTypeRefEquals(entry.physicalCarrier, physicalCarrier) &&
            entry.bindings.size === candidate.bindings.size &&
            [...entry.bindings].every(([node, type]) => candidate.bindings.get(node) === type)))
            entries.push(Object.freeze({ ...candidate, physicalCarrier }));
        }
      }
      if (entries.length > 0) membersByCarrier.set(key, Object.freeze(entries));
      return carrier;
    },
    select(carrier, selected, queries) {
      const present = getCsharpNullableElementTargetType(carrier) ?? carrier;
      const entries = membersByCarrier.get(targetTypeRefKey(present));
      if (entries === undefined) return { kind: "unavailable" };
      const exact = entries.filter(entry => sourceBoundTypeRelationship(
        entry.source, selected, queries, declaration => entry.bindings.get(declaration),
      ) !== undefined);
      const candidates = exact.length > 0 ? exact : entries.filter(entry =>
        queries.types.isNumberLike(selected) && queries.types.isNumberLike(entry.source) ||
        queries.types.isBigIntLike(selected) && queries.types.isBigIntLike(entry.source));
      const first = candidates[0];
      return first === undefined || candidates.some(candidate => !targetTypeRefEquals(candidate.physicalCarrier, first.physicalCarrier))
        ? { kind: "rejected" } : { kind: "resolved", carrier: first.physicalCarrier };
    },
  };
}
