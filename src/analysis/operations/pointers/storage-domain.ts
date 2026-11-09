import type { Node } from "@tsonic/tsts";
import type { SourceStorageBindings, SourceStorageUnresolved } from "@tsonic/target-api/analysis";
import type { CsharpPolicyContext } from "../../../policy/model/context.js";
import type { CsharpRepresentationOutcome } from "../../../target-model/types/representation.js";
import type { TargetTypeRef } from "../../../target-model/types/native-type-data.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { resolveCsharpPointerStoragePointee } from "../../storage/pointer-pointee.js";
import { represented } from "../../../policy/types/source-type-flow/representation-results.js";

export function csharpPointerStorageDomainRejection(
  input: Pick<CsharpPolicyContext, "sourceStorage" | "representation">,
  expression: Node,
  pointee: TargetTypeRef,
  bindings: SourceStorageBindings,
): CsharpRepresentationOutcome<string | undefined> | Extract<SourceStorageUnresolved, { readonly kind: "unresolved" }> {
  const subject = input.sourceStorage.subject(expression);
  if (subject.kind === "refused") return Object.freeze({ kind: "source-refused", refusal: subject });
  if (subject.kind === "unresolved") return subject;
  const backing = input.sourceStorage.memory.pointerBacking.value(subject.subject, bindings);
  if (backing.kind === "refused") return Object.freeze({ kind: "source-refused", refusal: backing });
  if (backing.kind === "unresolved") return backing;
  const selected = backing.value;
  if (selected.includesAbsence) return represented("The bound location requires a present canonical pointer storage domain.");
  const endpoints = [
    ...selected.producers.map(producer => producer.storage),
    ...(selected.kind === "open" ? selected.boundaries : []),
  ];
  if (endpoints.length === 0) return represented("The bound location has no checked native pointer producer or boundary.");
  for (const endpoint of endpoints) {
    const type = resolveCsharpPointerStoragePointee(input.representation, endpoint);
    if (type.kind !== "represented") return type;
    if (type.value.kind === "unresolved") return represented(type.value.reason);
    if (!targetTypeRefEquals(type.value.type, pointee)) {
      return represented("The selected location and bound field have different C# pointee carriers.");
    }
  }
  return represented(undefined);
}
