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
  if (!selectedTargetTypeArgumentListMatchesMember(selectedSignature)) {
    return undefined;
  }
  return enrichCsharpTargetMember(selectedSignature.member, host, {
    declaringTargetType: options.declaringTargetType,
    methodTargetTypeArguments: selectedSignature.targetTypeArguments ?? [],
  });
}

function selectedTargetTypeArgumentListMatchesMember(selectedSignature: SelectedTargetSignatureFact): boolean {
  if (selectedSignature.targetTypeArguments === undefined) {
    return true;
  }
  return selectedSignature.targetTypeArguments.length === (selectedSignature.member.typeParameters?.length ?? 0);
}
