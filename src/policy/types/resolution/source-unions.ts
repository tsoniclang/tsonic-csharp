import type { Node, Type } from "@tsonic/tsts";
import { sourceBoundTypeRelationship, type SourceFileSemantics } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../../target-model/types/equality.js";
import { getCsharpRuntimeUnionArms } from "../../../target-model/types/runtime-carriers.js";
import { getCsharpNullableElementTargetType } from "../../../target-model/types/nullable.js";
import type { CsharpTypeResolutionState } from "./model.js";

interface CsharpSourceUnionMember {
  readonly source: Type;
  readonly carrier: TargetTypeRef;
  readonly bindings: ReadonlyMap<Node, Type>;
}

export interface CsharpSourceUnionIndex {
  retain(
    carrier: TargetTypeRef | undefined,
    members: readonly { readonly source: Type; readonly carrier: TargetTypeRef }[],
    queries: SourceFileSemantics,
    state: CsharpTypeResolutionState,
  ): TargetTypeRef | undefined;
  select(carrier: TargetTypeRef, selected: Type, queries: SourceFileSemantics):
    { readonly kind: "unavailable" | "rejected" } | { readonly kind: "resolved"; readonly carrier: TargetTypeRef };
}

export function createCsharpSourceUnionIndex(): CsharpSourceUnionIndex {
  const membersByCarrier = new Map<string, readonly CsharpSourceUnionMember[]>();
  return {
    retain(carrier, members, queries, state) {
      if (carrier === undefined) return undefined;
      const present = getCsharpNullableElementTargetType(carrier) ?? carrier;
      if (getCsharpRuntimeUnionArms(present) === undefined) return carrier;
      const key = targetTypeRefKey(present);
      const entries = [...membersByCarrier.get(key) ?? []];
      const bindings = new Map([...state.sourceBindings ?? []].map(([node, binding]) => [node, binding.sourceType]));
      for (const member of members) {
        const inner = getCsharpNullableElementTargetType(member.carrier) ?? member.carrier;
        const nested = getCsharpRuntimeUnionArms(inner) === undefined ? undefined
          : membersByCarrier.get(targetTypeRefKey(inner));
        const sources = queries.types.isUnion(member.source)
          ? queries.types.unionOrIntersectionTypes(member.source) : [member.source];
        const candidates = nested ?? sources.filter(source => !queries.types.isNullish(source))
          .map(source => Object.freeze({ source, carrier: inner, bindings }));
        for (const candidate of candidates) {
          if (!entries.some(entry => entry.source === candidate.source &&
            targetTypeRefEquals(entry.carrier, candidate.carrier) &&
            entry.bindings.size === candidate.bindings.size &&
            [...entry.bindings].every(([node, type]) => candidate.bindings.get(node) === type))) entries.push(candidate);
        }
      }
      membersByCarrier.set(key, Object.freeze(entries));
      return carrier;
    },
    select(carrier, selected, queries) {
      const present = getCsharpNullableElementTargetType(carrier) ?? carrier;
      const entries = membersByCarrier.get(targetTypeRefKey(present));
      if (entries === undefined) return { kind: "unavailable" };
      const candidates = entries.filter(entry => sourceBoundTypeRelationship(
        entry.source, selected, queries, declaration => entry.bindings.get(declaration),
      ) !== undefined);
      const first = candidates[0];
      return first === undefined || candidates.some(candidate => !targetTypeRefEquals(candidate.carrier, first.carrier))
        ? { kind: "rejected" } : { kind: "resolved", carrier: first.carrier };
    },
  };
}
