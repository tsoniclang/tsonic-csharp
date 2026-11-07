// Structural shape ownership over Host object facts (nextgen C-2542 §2, G8, R2). The deleted
// objects/shapes/source-evidence.ts decided from checker symbols and root symbols whether a structural type's members
// were declared by the project. The Host now publishes each member with its declarations and owner
// (facts.objects.members) and each declaration's project role; C# never re-derives ownership, and a foreign declared
// type without a .NET binding is refused, never rebuilt as a project structural object.
import assert from "node:assert/strict";
import test from "node:test";
import { hostProgram, representationServices, representations } from "../../representation/host-fixture.mjs";

function fixture() {
  return hostProgram(`
import type { int32 } from "@tsonic/core/types.js";
import type { External, ExternalShape } from "@fixture/api";
type Local = { readonly value: int32; label: string };
type Picked = Pick<ExternalShape, "value">;
export function local(value: Local): Local { return value; }
export function picked(value: Picked): Picked { return value; }
export function external(value: External): External { return value; }
`, { files: {
    "node_modules/@fixture/api/package.json": JSON.stringify({ name: "@fixture/api", version: "1.0.0", types: "index.d.ts" }),
    "node_modules/@fixture/api/index.d.ts": "export interface ExternalShape { value: number; extra: string; } export declare class External { value: number; }",
  } });
}

const membersOf = (program, owner) => {
  const parameter = program.ast.parameters(program.named(owner))[0];
  const members = program.facts.objects.members(program.slot(parameter));
  assert.equal(Array.isArray(members), true, `${owner}: the Host publishes the member inventory`);
  return members;
};

test("project literal-type members are project owned, in authored order", () => {
  const program = fixture();
  const members = membersOf(program, "local");
  assert.deepEqual(members.map(member => member.name), ["value", "label"]);
  assert.equal(members.every(member => member.declarations.length > 0 &&
    member.declarations.every(declaration => program.facts.navigation.identity.isProjectDeclaration(declaration))), true);
  assert.equal(members[0].readonly && !members[1].readonly, true);
});

test("a project alias over foreign members keeps the foreign declarations; ownership is not invented", () => {
  const program = fixture();
  const members = membersOf(program, "picked");
  assert.deepEqual(members.map(member => member.name), ["value"], "Pick keeps exactly the selected key");
  assert.equal(members[0].declarations.length > 0 && members[0].declarations.every(declaration =>
    !program.facts.navigation.identity.isProjectDeclaration(declaration)), true,
  "the project alias does not erase the foreign member's provenance");
});

test("a foreign declared class without a .NET binding is refused, not rebuilt as a project structural object", () => {
  const program = fixture();
  const parameter = program.ast.parameters(program.named("external"))[0];
  const refused = representations(representationServices(program)).slot(parameter);
  assert.equal(refused.kind === "csharp-refused" && refused.code === "CSHARP_DECLARATION_BINDING", true,
    "the provider owner remains the only construction route for a foreign class");
});
