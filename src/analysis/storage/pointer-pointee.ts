import type { SourceMemoryBoundary, SourceMemoryProducer } from "@tsonic/target-api/source";
import type { CsharpRepresentationOutcome } from "../../target-model/types/representation.js";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { CsharpPointerStoragePointeeSelection } from "../../target-model/records/storage/pointer-storage.js";
import { csharpRuntimeLocationPointee } from "../../target-model/types/carriers/runtime-carriers.js";
import { getCsharpNullableElementTargetType } from "../../target-model/types/carriers/nullable.js";
import { getCsharpGenericOptionalParts } from "../../target-model/types/projections.js";
import { represented, sourceOutcome } from "../../policy/types/source-type-flow/representation-results.js";
import { selectCsharpMemoryRuntimeDefinition } from "../operations/pointers/runtime-definitions.js";

export function resolveCsharpPointerStoragePointee(
  host: Pick<CsharpPolicyContext, "representation" | "providers">,
  storage: SourceMemoryProducer | SourceMemoryBoundary,
): CsharpRepresentationOutcome<CsharpPointerStoragePointeeSelection> {
  const { representation } = host;
  const instantiated = sourceOutcome(representation.source.substitute(storage.type, storage.typeBindings));
  if (instantiated.kind !== "represented") return instantiated;
  const selected = representation.represent(instantiated.value, "storage", storage.subject.node);
  if (selected.kind !== "represented") return selected;
  const carrier = getCsharpNullableElementTargetType(selected.value.carrier) ??
    getCsharpGenericOptionalParts(selected.value.carrier)?.element ?? selected.value.carrier;
  const definition = selectCsharpMemoryRuntimeDefinition(host, "Location", storage.subject.node);
  if (definition.kind !== "represented") return definition;
  const pointee = csharpRuntimeLocationPointee(carrier, definition.value);
  return represented(pointee === undefined
    ? Object.freeze({ kind: "unresolved", reason: "The pointer producer does not have one exact native pointee carrier in every activation." })
    : Object.freeze({ kind: "resolved", type: pointee }));
}
