import type {
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  CsharpObjectShapeMemberFact,
} from "../csharp-facts.js";
import {
  hashString,
  targetTypeRefKey,
} from "./target-ref-utils.js";

export function getObjectShapeTargetName(
  prefix: string,
  members: readonly CsharpObjectShapeMemberFact[],
  implementsTypes: readonly TargetTypeRef[] | undefined = undefined,
): string {
  const key = [
    ...members.map(objectShapeMemberKey).sort(),
    ...(implementsTypes ?? []).map((type) => `implements:${targetTypeRefKey(type)}`),
  ].join("|");
  return `${prefix}_${hashString(key)}`;
}

function objectShapeMemberKey(member: CsharpObjectShapeMemberFact): string {
  return [
    member.sourceName,
    member.targetName,
    member.memberKind,
    member.optional === true ? "optional" : "required",
    targetTypeRefKey(member.type),
  ].join(":");
}
