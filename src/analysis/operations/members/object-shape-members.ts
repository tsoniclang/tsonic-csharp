import type { ExtensionFactSubject, Node } from "@tsonic/tsts";
import { sourceTypeDescriptorMemberOriginsEqual, sourceTypeDescriptorStructure,
  type SourceEffectiveTypeOutcome, type SourceTypeDescriptor, type SourceTypeDescriptorMember } from "@tsonic/target-api/source";
import type { CsharpObjectShapeMemberFact, TargetTypeRef } from "../../../target-model/types/model.js";

import { csharpObjectShapeMemberRetainsNativeReference } from "../../../policy/types/objects/member-reads.js";

interface CsharpPublishedMemberRead {
  readonly receiver: Node;
  readonly publication: SourceEffectiveTypeOutcome | undefined;
  readonly selectedDeclaration: Node | undefined;
  readonly selectedSubjects: readonly ExtensionFactSubject[];
}

export function resolveCsharpObjectShapeMemberReadTargetType(
  member: CsharpObjectShapeMemberFact,
  selection: CsharpPublishedMemberRead,
  selectedTargetType?: TargetTypeRef,
): TargetTypeRef | undefined {
  const publication = selection?.publication;
  if (publication === undefined || publication.kind === "refused" ||
    publication.provenance.occurrence !== selection.receiver || selection.selectedSubjects.length === 0 ||
    member.origins === undefined || member.origins.length === 0) return undefined;
  const selected = selectedPublishedMembers(publication.type, selection.selectedSubjects, new Set());
  if (selected === undefined || selected.length === 0 || selected.some(published => !member.origins?.some(origin =>
    sourceTypeDescriptorMemberOriginsEqual(origin, published.origin))) ||
    selection.selectedDeclaration !== undefined && !selected.some(published => published.origin.kind === "declared" &&
      published.origin.declaration === selection.selectedDeclaration)) return undefined;
  return csharpObjectShapeMemberRetainsNativeReference(selectedTargetType, member.type)
    ? selectedTargetType : member.type;
}

function selectedPublishedMembers(
  descriptor: SourceTypeDescriptor,
  subjects: readonly ExtensionFactSubject[],
  active: Set<SourceTypeDescriptor>,
): readonly SourceTypeDescriptorMember[] | undefined {
  if (active.has(descriptor)) return undefined;
  active.add(descriptor);
  try {
    const structure = sourceTypeDescriptorStructure(descriptor);
    if (structure.kind === "optional") return selectedPublishedMembers(structure.value, subjects, active);
    if (structure.kind === "union") {
      const members: SourceTypeDescriptorMember[] = [];
      for (const type of structure.types) {
        const selected = selectedPublishedMembers(type, subjects, active);
        if (selected === undefined) return undefined;
        members.push(...selected);
      }
      return members;
    }
    if (structure.kind !== "shape") return undefined;
    const members = structure.members.filter(member => member.origin.kind === "declared" && subjects.includes(member.origin.declaration));
    return members.length === 1 ? members : undefined;
  } finally {
    active.delete(descriptor);
  }
}
