import type { Node } from "@tsonic/tsts";
import type { CsharpTypeQueries, CsharpRepresentedStorage } from "../../../policy/model/type-resolution.js";
import type { CsharpRepresentationOutcome, CsharpRepresentationView } from "../../../target-model/types/representation.js";
import type { SourcePresence, SourceProgramFacts } from "@tsonic/target-api/source";
import { representCsharpApplication, representCsharpCallableReturn, representCsharpDeclaredSlot, representCsharpValue } from "../representations.js";
import { representCsharpMemberUse } from "../member-use.js";

export function createCsharpTypeQueries(facts: SourceProgramFacts, representation: CsharpRepresentationView): CsharpTypeQueries {
  const host = Object.freeze({ facts, representation });
  const storage = (occurrence: Node): CsharpRepresentationOutcome<SourcePresence<CsharpRepresentedStorage>> => {
    const place = facts.protocols.storage(occurrence);
    if (place.kind === "refused") return Object.freeze({ kind: "source-refused", refusal: place });
    if (place.value.kind === "none") return Object.freeze({ kind: "represented", value: Object.freeze({ kind: "none" }) });
    const source = place.value.value;
    const value = representation.represent(source.value, "storage", occurrence);
    return value.kind !== "represented" ? value : Object.freeze({ kind: "represented",
      value: Object.freeze({ kind: "present", value: Object.freeze({ source, value: value.value }) }) });
  };
  return Object.freeze({
    ...host,
    value: occurrence => representCsharpValue(host, occurrence),
    declaredSlot: declaration => representCsharpDeclaredSlot(host, declaration),
    storage,
    callableReturn: (signature, site) => representCsharpCallableReturn(host, signature, site),
    application: occurrence => representCsharpApplication(host, occurrence),
    memberUse: occurrence => representCsharpMemberUse(host, occurrence),
    operation(occurrence) {
      const value = facts.values.operation(occurrence);
      return value.kind === "refused" ? Object.freeze({ kind: "source-refused", refusal: value })
        : Object.freeze({ kind: "represented", value: value.value });
    },
    parameter: (original, site) => representation.parameter(original, site),
  });
}
