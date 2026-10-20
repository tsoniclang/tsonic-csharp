import type { SourceFileSemantics } from "@tsonic/target-api/source";
import type { CsharpTargetReceiverRelation } from "../../../target-model/identities/provider-relations.js";
import type { CsharpTargetMember } from "../../types/index.js";

type ResolvedSourcePropertyAccessInfo = NonNullable<
  ReturnType<SourceFileSemantics["operations"]["propertyAccess"]>
>;

export function providerReceiverMatchesProperty(
  receiver: CsharpTargetReceiverRelation,
  targetMember: CsharpTargetMember,
  source: ResolvedSourcePropertyAccessInfo,
): boolean {
  switch (receiver.kind) {
    case "instance":
      return targetMember.static !== true;
    case "none":
      return targetMember.static === true;
    case "target-parameter":
      return source.receiver.expression !== undefined &&
        targetMember.parameters[
          receiver.targetParameterIndex
        ] !== undefined;
  }
}

export function csharpProviderPropertySupportsAccess(
  member: CsharpTargetMember,
  accessMode: ResolvedSourcePropertyAccessInfo["accessMode"],
): boolean {
  if (
    member.kind !== "property" &&
    member.kind !== "field" &&
    member.kind !== "event"
  ) {
    return false;
  }
  if (accessMode === "write" || accessMode === "read-write") {
    return member.readonly !== true && member.returnType !== undefined;
  }
  return member.returnType !== undefined;
}
