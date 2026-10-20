import type { SourceFileSemantics } from "@tsonic/target-api/source";
import type { CsharpProviderTargetRelation } from "../../../target-model/identities/provider-relations.js";
import type { CsharpTargetMember } from "../../types/index.js";

type ResolvedSourceElementAccessInfo = NonNullable<
  ReturnType<SourceFileSemantics["operations"]["elementAccess"]>
>;
type CsharpProviderSignatureRelation = Extract<
  CsharpProviderTargetRelation,
  { readonly kind: "signature" }
>;

export function providerReceiverMatchesElement(
  relation: CsharpProviderSignatureRelation,
  _source: ResolvedSourceElementAccessInfo,
): boolean {
  switch (relation.receiver.kind) {
    case "instance":
      return relation.targetMember.static !== true;
    case "none":
      return relation.targetMember.static === true;
    case "target-parameter":
      return relation.targetMember.parameters[
        relation.receiver.targetParameterIndex
      ] !== undefined;
  }
}

export function csharpProviderElementSupportsAccess(
  member: CsharpTargetMember,
  accessMode: ResolvedSourceElementAccessInfo["accessMode"],
): boolean {
  if (member.returnType === undefined) {
    return false;
  }
  return accessMode === "read" ||
    (accessMode === "write" || accessMode === "read-write") &&
      member.readonly !== true;
}
