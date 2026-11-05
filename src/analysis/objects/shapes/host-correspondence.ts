import type { AstReader, Node } from "@tsonic/tsts";
import { sourceTypeDescriptorMemberOriginsEqual, type SourceEffectiveTypeOutcome } from "@tsonic/target-api/source";
import type { CsharpObjectShapeFact } from "../../../target-model/types/model.js";

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
): CsharpHostLiteralCorrespondence {
  if (!ast.is.IsObjectLiteralExpression(node) || outcome === undefined || outcome.kind === "refused" ||
    outcome.memberCorrespondence === undefined) return notPublished;
  const properties = ast.properties(node).filter((property): property is Node => property !== undefined);
  // Spread members are not yet described by the Host correspondence.
  if (properties.some(property => ast.is.IsSpreadAssignment(property))) return notPublished;
  if (destination.members.some(member => member.origin === undefined)) return notPublished;
  const rejected = (reason: string): CsharpHostLiteralCorrespondence => Object.freeze({ kind: "rejected", reason });
  // A literal with members the Host correspondence does not describe keeps its existing proof path.
  if (outcome.memberCorrespondence.length !== properties.length) return notPublished;
  const covered = new Set<number>();
  for (const entry of outcome.memberCorrespondence) {
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
