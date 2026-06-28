import type {
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  CsharpTargetMember,
} from "./target-types.js";
import {
  enrichCsharpTargetMember,
} from "./target-enrichment.js";
import type {
  CsharpTargetEnrichmentHost,
} from "./target-enrichment.js";

export function instantiateSelectedTargetMember(
  selectedSignature: { readonly member: CsharpTargetMember; readonly targetTypeArguments?: readonly TargetTypeRef[] },
  host: CsharpTargetEnrichmentHost,
  options: { readonly declaringTargetType?: TargetTypeRef } = {},
): CsharpTargetMember | undefined {
  if (!selectedTargetTypeArgumentListMatchesMember(selectedSignature)) {
    return undefined;
  }
  return enrichCsharpTargetMember(selectedSignature.member, host, {
    declaringTargetType: options.declaringTargetType,
    methodTargetTypeArguments: selectedSignature.targetTypeArguments ?? [],
  });
}

function selectedTargetTypeArgumentListMatchesMember(selectedSignature: { readonly member: CsharpTargetMember; readonly targetTypeArguments?: readonly TargetTypeRef[] }): boolean {
  if (selectedSignature.targetTypeArguments === undefined) {
    return true;
  }
  return selectedSignature.targetTypeArguments.length === (selectedSignature.member.typeParameters?.length ?? 0);
}
