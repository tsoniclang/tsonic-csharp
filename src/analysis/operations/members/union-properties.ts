import type { CsharpUnionProperty } from "../../../target-model/records/objects/union-properties.js";
import type { SourceMemberAccessSelection } from "@tsonic/target-api/source";
import { sourceUnionRelation } from "../../program/source-facts.js";
import type { CsharpProviderCallSelectionHost } from "../../../policy/model/provider-calls.js";
import type { CsharpSourceProfilePropertyPolicyResult } from "../../../target-model/records/program/source-profile-invocations.js";

import { getCsharpRuntimeUnionArms } from "../../../target-model/types/carriers/runtime-carriers.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { selectCsharpSourceProfilePropertyForCarrier } from "../source-profiles/selection.js";
import { sourceProfilePropertyIdentities } from "../source-profiles/policy-selection.js";
import { selectCsharpErrorNativeProperty } from "../../../policy/operations/source-profiles/error-source-profile.js";
import { csharpSourceProfileDiagnostic } from "../../../policy/operations/source-profiles/source-profile-policy.js";

export function selectCsharpUnionProperty(
  host: CsharpProviderCallSelectionHost,
  source: SourceMemberAccessSelection,
): CsharpUnionProperty | Extract<CsharpSourceProfilePropertyPolicyResult, { readonly kind: "rejected" }> | undefined {
  if (source.access !== "read" || source.optionalChain) return undefined;
  const carrier = host.types.readStorage(source.receiver);
  if (carrier.kind === "csharp-refused") return undefined;
  const variants = getCsharpRuntimeUnionArms(carrier, host.typeDefinitions);
  if (variants === undefined) return undefined;
  const selectedCarrier = host.types.value(source.receiver);
  if (selectedCarrier.kind !== "csharp-refused" && getCsharpRuntimeUnionArms(selectedCarrier, host.typeDefinitions) === undefined) return undefined;
  // The Host relation at the receiver read selects the arms still present after narrowing; runtime arms are
  // positional in the Host arm order (R6).
  const relation = sourceUnionRelation(host.facts, source.receiver);
  if (relation?.kind === "extract-arm") return undefined;
  const guarded = relation?.kind === "map" && relation.mode === "narrowed-read"
    ? relation.mapping.flatMap((destination, arm) => destination >= 0 ? [arm] : []) : undefined;
  if (guarded?.length === 1) return undefined;
  const indexes = variants.flatMap((_variant, index) => guarded === undefined || guarded.includes(index) ? [index] : []);
  if (indexes.length === 0) return undefined;
  const identities = sourceProfilePropertyIdentities(host, source.use);
  if (indexes.some(index => identities.some(identity =>
    selectCsharpErrorNativeProperty(host, identity, variants[index]!)?.kind === "resolved"))) return {
    kind: "rejected",
    diagnostic: csharpSourceProfileDiagnostic("CSHARP_ERROR_UNION_PROPERTY_UNSUPPORTED", 9100961,
      "A common inherited native Error property on an un-narrowed runtime union is unsupported in v1; narrow the Error subtype before reading the property.", []),
  };
  const operations = new Map<number, Extract<CsharpSourceProfilePropertyPolicyResult, { readonly kind: "resolved" }>>();
  for (const index of indexes) {
    const selected = selectCsharpSourceProfilePropertyForCarrier(host, source.use, variants[index]!);
    if (selected?.kind !== "resolved" || selected.receiver.kind !== "instance" || selected.invocation.kind !== "member" ||
      selected.targetMember.static === true || !["field", "property"].includes(selected.targetMember.kind) ||
      selected.targetMember.declaringType === undefined ||
      !targetTypeRefEquals(selected.targetMember.declaringType, variants[index]!)) return undefined;
    operations.set(index, selected);
  }
  const resultCarrier = operations.get(indexes[0]!)!.targetMember.returnType;
  if (resultCarrier === undefined || [...operations.values()].some(operation =>
    operation.targetMember.returnType === undefined || !targetTypeRefEquals(operation.targetMember.returnType, resultCarrier))) return undefined;
  return Object.freeze({ kind: "union-property", source, unionCarrier: carrier,
    selectedVariantIndexes: Object.freeze(indexes), resultCarrier,
    variants: Object.freeze(variants.map((variant, index) => Object.freeze({ carrier: variant,
      ...(operations.has(index) ? { operation: operations.get(index)! } : {}) }))) });
}
