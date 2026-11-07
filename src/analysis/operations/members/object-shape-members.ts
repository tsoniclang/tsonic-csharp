import type { SourceMemberAccessSelection } from "@tsonic/target-api/source";
import type { CsharpObjectShapeMemberFact, TargetTypeRef } from "../../../target-model/types/model.js";

import { csharpObjectShapeMemberRetainsNativeReference } from "../../../policy/types/objects/member-reads.js";

/**
 * The read type of an object-shape member at a member read: the member applies when the Host member selection names
 * one of the shape member's declarations or published origins (member identity, never a checker type relation).
 */
export function resolveCsharpObjectShapeMemberReadTargetType(
  member: CsharpObjectShapeMemberFact,
  selection: SourceMemberAccessSelection,
  selectedTargetType?: TargetTypeRef,
): TargetTypeRef | undefined {
  if (selection.selected.kind !== "member") return undefined;
  const selected = selection.selected.declarations;
  const agrees = selected.some(declaration => member.sourceDeclarations?.includes(declaration) === true ||
    member.origins?.some(origin => origin.kind === "declared" && origin.declaration === declaration) === true);
  if (!agrees) return undefined;
  return csharpObjectShapeMemberRetainsNativeReference(selectedTargetType, member.type) ? selectedTargetType : member.type;
}
