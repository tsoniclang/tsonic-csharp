// Object-literal member correspondence over Host facts (nextgen C-2542 §2, G8, R2). The deleted
// objects/shapes/member-evidence.ts paired a literal's properties with destination members through checker structural
// correspondence. The Host now publishes, per literal element, the destination member it fills
// (selections.objectLiteralElement) and the literal's member correspondence; C# reads those records only.
import assert from "node:assert/strict";
import test from "node:test";
import { hostProgram, representationServices, representations, represented } from "../../representation/host-fixture.mjs";
import { csharpSourcePrimitiveTargetType, targetTypeRefEquals } from "../../../dist/target-model/types/index.js";
import { sourceTypeDescriptorMemberOriginsEqual } from "@tsonic/target-api/source";

function fixture() {
  const program = hostProgram(`
import type { int64 } from "@tsonic/core/types.js";
interface Slot { count: int64; }
export const source: Slot = { count: 1n };
export const earlier: Slot = { count: 2n };
export const loose = { count: 3n };
`);
  const literal = name => program.ast.as.AsVariableDeclaration(program.named(name)).Initializer;
  const property = name => program.ast.properties(literal(name))[0];
  const slotMember = program.facts.objects.members(program.type(program.named("Slot")))[0];
  return { program, literal, property, slotMember };
}

test("a literal property fills exactly its destination member, with the destination's native width", () => {
  const { program, property, slotMember } = fixture();
  const element = program.facts.selections.objectLiteralElement(property("source"));
  assert.equal(element?.elementKind === "property" && element.element === property("source"), true);
  assert.equal(element.destination?.declarations.length === 1 && element.destination.declarations[0] === slotMember.declarations[0], true,
    "the exact destination member declaration");
  const at = representations(representationServices(program));
  assert.equal(targetTypeRefEquals(represented(at.type(element.destination.type, property("source"), "storage")),
    csharpSourcePrimitiveTargetType("int64")), true, "native int64 storage");
  assert.equal(Object.isFrozen(element) && Object.isFrozen(element.destination.declarations), true);
});

test("each literal keeps its own producer occurrence for the shared destination member", () => {
  const { program, property, literal } = fixture();
  const current = program.facts.selections.objectLiteralElement(property("source"));
  const other = program.facts.selections.objectLiteralElement(property("earlier"));
  assert.equal(current.destination.declarations[0] === other.destination.declarations[0], true, "one destination member");
  assert.equal(current.objectLiteral === literal("source") && other.objectLiteral === literal("earlier"), true,
    "the producer is the current literal, never an earlier one");
  const outcome = program.facts.values.type(literal("source"));
  assert.equal(outcome.kind !== "refused", true);
  if (outcome.memberCorrespondence !== undefined) {
    assert.equal(outcome.memberCorrespondence.length, 1);
    assert.equal(outcome.memberCorrespondence[0].property === property("source"), true, "only the current property");
  }
});

test("a literal with no destination type has no destination member; the origin check is exact", () => {
  const { program, property, slotMember } = fixture();
  const loose = program.facts.selections.objectLiteralElement(property("loose"));
  assert.equal(loose === undefined || loose.destination === undefined, true, "no destination is invented for an untyped literal");
  const origin = { kind: "declared", declaration: slotMember.declarations[0] };
  assert.equal(sourceTypeDescriptorMemberOriginsEqual(origin, { kind: "declared", declaration: slotMember.declarations[0] }), true);
  assert.equal(sourceTypeDescriptorMemberOriginsEqual(origin, { kind: "declared", declaration: property("earlier") }), false,
    "an unrelated declaration is a different origin");
});
