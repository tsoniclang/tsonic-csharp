import type { SourceApplication, SourcePresence } from "@tsonic/target-api/source";
import type { CsharpProviderOperationHost } from "../../../policy/model/provider-calls.js";
import type { CsharpRepresentationOutcome } from "../../../target-model/types/representation.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";

export function selectCsharpProviderPointerResult(
  host: CsharpProviderOperationHost, application: SourceApplication,
): CsharpRepresentationOutcome<SourcePresence<TargetTypeRef>> {
  const pointer = host.facts.protocols.pointerType(application.result);
  if (pointer.kind === "refused") return Object.freeze({ kind: "source-refused", refusal: pointer });
  if (pointer.value.kind === "none") return Object.freeze({ kind: "represented", value: pointer.value });
  const selected = host.representation.represent(application.result, "value", application.identity.invocation);
  return selected.kind !== "represented" ? selected
    : Object.freeze({ kind: "represented", value: Object.freeze({ kind: "present", value: selected.value.carrier }) });
}
