import type {
  SelectedTargetSignatureFact,
  TargetMember,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  enrichCsharpTargetMember,
} from "./target-enrichment.js";
import type {
  CsharpTargetEnrichmentHost,
} from "./target-enrichment.js";

export function instantiateSelectedTargetMember(
  selectedSignature: SelectedTargetSignatureFact,
  host: CsharpTargetEnrichmentHost,
  options: { readonly declaringTargetType?: TargetTypeRef } = {},
): TargetMember | undefined {
  return enrichCsharpTargetMember(selectedSignature.member, host, {
    declaringTargetType: options.declaringTargetType,
    methodTargetTypeArguments: selectedSignature.targetTypeArguments ?? [],
  });
}
