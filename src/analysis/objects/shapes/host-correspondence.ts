import type { AstReader, Node } from "@tsonic/tsts";
import { sourceTypeDescriptorMemberOriginsEqual, sourceTypeDescriptorStructure, type SourceEffectiveTypeOutcome } from "@tsonic/target-api/source";
import type { CsharpObjectShapeFact, TargetTypeRef } from "../../../target-model/types/model.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";

// The Host publishes, for every authored object-literal member, the origin of the destination member it
// constructs (memberCorrespondence). When the destination shape comes from a Source descriptor, each of its
// members carries that origin, so the literal's construction is proven from Host facts alone.
export type CsharpHostLiteralCorrespondence =
  | { readonly kind: "not-published" }
  | { readonly kind: "proven" }
  | { readonly kind: "rejected"; readonly reason: string };

const notPublished: CsharpHostLiteralCorrespondence = Object.freeze({ kind: "not-published" });
const proven: CsharpHostLiteralCorrespondence = Object.freeze({ kind: "proven" });

export function selectCsharpHostLiteralCorrespondence(
  ast: AstReader,
  node: Node,
  outcome: SourceEffectiveTypeOutcome | undefined,
  destination: CsharpObjectShapeFact,
  publishedTarget: TargetTypeRef | undefined,
): CsharpHostLiteralCorrespondence {
  if (!ast.is.IsObjectLiteralExpression(node) || outcome === undefined || outcome.kind === "refused" ||
    outcome.memberCorrespondence === undefined) return notPublished;
  const properties = ast.properties(node).filter((property): property is Node => property !== undefined);
  // Spread members are not yet described by the Host correspondence.
  if (properties.some(property => ast.is.IsSpreadAssignment(property))) return notPublished;
  // Only data-member constructions are proven here. Methods and accessors keep the Native implementation, capture and
  // read/write checks of the literal-construction path.
  if (properties.some(property => !(ast.is.IsPropertyAssignment(property) || ast.is.IsShorthandPropertyAssignment(property))) ||
    destination.members.some(member => member.memberKind !== "property" || member.accessor !== undefined)) return notPublished;
  // The destination must be the represented published instantiation itself: origins identify declarations, not widths
  // (Box<int32> and Box<int64> share the origin of value).
  if (publishedTarget === undefined || !targetTypeRefEquals(destination.targetType, publishedTarget)) return notPublished;
  if (outcome.provenance.occurrence !== node) return notPublished;
  if (destination.members.some(member => member.origin === undefined)) return notPublished;
  // The Host correspondence is relative to the PUBLISHED descriptor. It proves this construction only when the
  // native destination shape is that published structure (the same member origins); otherwise the literal keeps
  // its existing path (e.g. a literal published as its own shape but stored in a declared native record).
  let value = outcome.type;
  while (value.kind === "optional") value = value.value;
  const published = sourceTypeDescriptorStructure(value);
  if (published.kind !== "shape") return notPublished;
  const publishedMembers = published.members;
  if (publishedMembers.length !== destination.members.length || destination.members.some(member =>
    member.origin === undefined || !publishedMembers.some(selected => sourceTypeDescriptorMemberOriginsEqual(selected.origin, member.origin!)))) {
    return notPublished;
  }
  const rejected = (reason: string): CsharpHostLiteralCorrespondence => Object.freeze({ kind: "rejected", reason });
  // A literal with members the Host correspondence does not describe keeps its existing proof path.
  if (outcome.memberCorrespondence.length !== properties.length) return notPublished;
  const covered = new Set<number>();
  const authored = new Set<Node>();
  for (const entry of outcome.memberCorrespondence) {
    if (!properties.includes(entry.property) || authored.has(entry.property)) {
      return rejected("A Host member correspondence must name each authored object-literal member exactly once.");
    }
    authored.add(entry.property);
    const matches = destination.members.flatMap((member, index) =>
      member.origin !== undefined && sourceTypeDescriptorMemberOriginsEqual(member.origin, entry.origin) ? [index] : []);
    if (matches.length !== 1 || covered.has(matches[0]!)) {
      return rejected("A Host member correspondence must select exactly one distinct native destination member.");
    }
    covered.add(matches[0]!);
  }
  for (const [index, member] of destination.members.entries()) {
    if (!covered.has(index) && member.optional !== true) {
      return rejected(`The required native member '${member.sourceName}' has no authored object-literal value.`);
    }
  }
  return proven;
}
