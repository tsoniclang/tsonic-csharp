import type { CsharpPromiseDiscard } from "../../../target-model/records/callables/promise-results.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpTypeDefinitions } from "../../../target-model/types/source-union-definitions.js";
import { getCsharpTaskResultTargetType } from "../../../target-model/types/carriers/delegates.js";
import { getCsharpNullableElementTargetType } from "../../../target-model/types/carriers/nullable.js";
import { getCsharpRuntimeUnionArms } from "../../../target-model/types/carriers/runtime-carriers.js";
import { isCsharpValueTypeTargetType } from "../../../target-model/types/identity.js";

export function selectCsharpPromiseDiscard(carrier: TargetTypeRef, definitions: CsharpTypeDefinitions):
  | { readonly kind: "selected"; readonly discard: CsharpPromiseDiscard | undefined }
  | { readonly kind: "unsupported"; readonly reason: string } {
  const active = new Set<TargetTypeRef>();
  const selections = new Map<TargetTypeRef, CsharpPromiseDiscard | undefined>();
  const visit = (carrier: TargetTypeRef): ReturnType<typeof selectCsharpPromiseDiscard> => {
    if (selections.has(carrier)) return { kind: "selected", discard: selections.get(carrier) };
    if (active.has(carrier)) return { kind: "unsupported", reason: "Native async result-use requires an acyclic completed completion topology." };
    active.add(carrier);
    try {
      let discard: CsharpPromiseDiscard | undefined;
      const nullable = getCsharpNullableElementTargetType(carrier);
      if (nullable !== undefined) {
        const present = visit(nullable);
        if (present.kind === "unsupported") return present;
        if (present.discard !== undefined) discard = Object.freeze({
          kind: "optional", valueType: isCsharpValueTypeTargetType(nullable), present: present.discard });
      } else if (getCsharpTaskResultTargetType(carrier) !== undefined) discard = Object.freeze({ kind: "task" });
      else {
        const alternatives = getCsharpRuntimeUnionArms(carrier, definitions);
        if (alternatives !== undefined) {
          const arms: { readonly index: number; readonly selection: CsharpPromiseDiscard }[] = [];
          for (const [index, alternative] of alternatives.entries()) {
            const selected = visit(alternative);
            if (selected.kind === "unsupported") return selected;
            if (selected.discard !== undefined) arms.push(Object.freeze({ index, selection: selected.discard }));
          }
          if (arms.length !== 0) discard = Object.freeze({ kind: "union", arms: Object.freeze(arms) });
        }
      }
      selections.set(carrier, discard);
      return { kind: "selected", discard };
    } finally { active.delete(carrier); }
  };
  return visit(carrier);
}
