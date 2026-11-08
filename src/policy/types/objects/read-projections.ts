import { selectCsharpFlowReadConversion } from "../../conversions/expression.js";
import { admitCsharpSourceConversion } from "../../conversions/source-admission.js";
import type { CsharpFlowReadProjection, CsharpValueRefinementClassification } from "../../../target-model/records/program/source-evidence.js";
import type { CsharpRepresentationOutcome, CsharpRepresentationView } from "../../../target-model/types/representation.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { nativeRepresentationFailure, represented } from "../source-type-flow/representation-results.js";

export function selectCsharpFlowReadProjection(
  policy: Parameters<typeof selectCsharpFlowReadConversion>[0],
  representation: CsharpRepresentationView,
  refinement: CsharpValueRefinementClassification,
  deferredConstructorField: boolean,
  selectedThrowable: boolean,
): CsharpRepresentationOutcome<Exclude<CsharpFlowReadProjection, { readonly kind: "rejected" }>> {
  if (refinement.kind !== "represented") return refinement;
  const { occurrence, selected, storage } = refinement.value;
  representation.source.assertEvidence(selected.evidence);
  if (storage.kind === "none") return represented(Object.freeze({ kind: "identity" }));
  representation.source.assertEvidence(storage.value.evidence);
  const source = storage.value.carrier;
  const target = selected.carrier;
  if (targetTypeRefEquals(source, target)) return represented(Object.freeze({ kind:
    source.kind === "type-parameter" && deferredConstructorField ? "non-null" : "identity" }));
  const relation = selectCsharpFlowReadConversion(policy, source, target, selectedThrowable);
  if (relation.kind === "rejected") return nativeRepresentationFailure(occurrence, "CSHARP_NATIVE_READ_PROJECTION_UNSUPPORTED", relation.reason);
  const admitted = admitCsharpSourceConversion({ representation, relation, source: storage.value, destination: selected, site: occurrence });
  return admitted.kind !== "represented" ? admitted
    : represented(Object.freeze({ kind: "conversion", source, target, selection: admitted.value }));
}
