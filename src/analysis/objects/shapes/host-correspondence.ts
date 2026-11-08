import type { Node } from "@tsonic/tsts";
import type { SourceDescriptorView, SourceMemberCorrespondenceQueries, SourceMemberPair, SourceTypeEvidence } from "@tsonic/target-api/source";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact } from "../../../target-model/types/model.js";
import type { CsharpRepresentationOutcome } from "../../../target-model/types/representation.js";
import { represented, sourceOutcome, nativeRepresentationFailure } from "../../../policy/types/source-type-flow/representation-results.js";
import { selectCsharpShapeMemberByOrigins } from "./member-origins.js";

export interface CsharpLiteralMemberCorrespondence {
  readonly source: CsharpObjectShapeMemberFact;
  readonly destination: CsharpObjectShapeMemberFact;
  readonly original: Extract<SourceMemberPair, { readonly kind: "present" }>;
}

export function selectCsharpHostLiteralCorrespondence(view: SourceDescriptorView, objects: SourceMemberCorrespondenceQueries,
  source: SourceTypeEvidence, destination: SourceTypeEvidence, sourceShape: CsharpObjectShapeFact,
  destinationShape: CsharpObjectShapeFact, site: Node): CsharpRepresentationOutcome<readonly CsharpLiteralMemberCorrespondence[]> {
  view.assertEvidence(source);
  view.assertEvidence(destination);
  const original = sourceOutcome(objects.correspondence(source, destination, "correspondence"));
  if (original.kind !== "represented") return original;
  if (original.value.kind === "unavailable") return nativeRepresentationFailure(site, "CSHARP_NATIVE_CONSTRUCTION_NOT_PROVEN",
    `The original Source construction correspondence is unavailable: ${original.value.reason}.`);
  const selected: CsharpLiteralMemberCorrespondence[] = [];
  const covered = new Set<CsharpObjectShapeMemberFact>();
  for (const pair of original.value.members) {
    const target = selectCsharpShapeMemberByOrigins(destinationShape,
      [...pair.destination.origins, ...pair.destination.readOrigins, ...pair.destination.writeOrigins]);
    if (target === undefined || covered.has(target)) return nativeRepresentationFailure(site, "CSHARP_NATIVE_MEMBER_ORIGIN_MISSING",
      "Every published destination member origin must select the same unique physical Native slot.");
    covered.add(target);
    if (pair.kind === "absent") {
      if (target.optional !== true) return nativeRepresentationFailure(site, "CSHARP_NATIVE_CONSTRUCTION_NOT_PROVEN",
        "A required physical Native slot has no authored Source construction value.");
      continue;
    }
    const value = selectCsharpShapeMemberByOrigins(sourceShape,
      [...pair.source.origins, ...pair.source.readOrigins, ...pair.source.writeOrigins]);
    if (value === undefined) return nativeRepresentationFailure(site, "CSHARP_NATIVE_MEMBER_ORIGIN_MISSING",
      "Every published source member origin must select the same unique physical Native slot.");
    selected.push(Object.freeze({ source: value, destination: target, original: pair }));
  }
  if (destinationShape.members.some(member => member.optional !== true && !covered.has(member))) return nativeRepresentationFailure(site,
    "CSHARP_NATIVE_CONSTRUCTION_NOT_PROVEN", "The completed Native construction has a required slot outside its published Source correspondence.");
  return represented(Object.freeze(selected));
}
