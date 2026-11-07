// Structural member collection over Host object facts (nextgen C-2542 §2, G8, I6). The deleted
// objects/shapes/member-evidence.ts derived members from the published descriptor plus checker queries, and
// resolution/callable-type-parameters.ts built method binders. Now members come from facts.objects.members (Host order,
// optional/readonly/declarations), representObjectMembers maps them, and representSignatureTypeParameters lists a
// method's authored binders followed by its generated projections.
import assert from "node:assert/strict";
import test from "node:test";
import { hostProgram, representationServices } from "../../representation/host-fixture.mjs";
import {
  csharpRepresentationContext, csharpRefusal, isCsharpRefusal, representObjectMembers, representSignatureTypeParameters,
} from "../../../dist/representation/index.js";
import { csharpSourceTypeParameter } from "../../../dist/source/extension/type-parameters.js";
import { csharpOptionalStorageProjection, getCsharpGenericOptionalParts } from "../../../dist/target-model/types/projections.js";

function scenario(rejectedIndex, count = 3) {
  const program = hostProgram(`import type { int64 } from "@tsonic/core/types.js";
    export interface Fields { ${Array.from({ length: count }, (_, index) =>
      `${index === 2 ? "readonly " : ""}field${index}${index === 1 ? "?" : ""}: int64;`).join(" ")} }`);
  const owner = program.named("Fields");
  const descriptor = program.type(owner);
  const members = program.facts.objects.members(descriptor);
  assert.equal(Array.isArray(members) && members.length === count, true, "the Host publishes the complete member inventory");
  const context = csharpRepresentationContext(representationServices(program), owner, "storage");
  const carrier = Object.freeze({ kind: "source-primitive", name: "int64" });
  const selected = [];
  const represent = type => {
    const index = selected.length;
    assert.equal(type === members[index].type, true, "the next Host member is represented in Host order");
    selected.push(index);
    return index === rejectedIndex ? csharpRefusal("CSHARP_FIXTURE_REFUSED", `field${index} has no carrier`, owner) : carrier;
  };
  return { collect: () => representObjectMembers(members, context, represent), selected, members, carrier };
}

test("structural members stop at the first refused carrier without publishing a partial shape", () => {
  for (const rejectedIndex of [0, 1, 2]) {
    const { collect, selected } = scenario(rejectedIndex);
    const result = collect();
    assert.equal(isCsharpRefusal(result) && result.code === "CSHARP_FIXTURE_REFUSED", true, `refused field${rejectedIndex}`);
    assert.deepEqual(selected, Array.from({ length: rejectedIndex + 1 }, (_, index) => index));
  }
});

test("structural member refusal does no later work even for a wide record", () => {
  const { collect, selected } = scenario(0, 256);
  assert.equal(isCsharpRefusal(collect()), true, "the refused record stays refused");
  assert.deepEqual(selected, [0]);
});

test("complete structural records keep Host member order, carriers, optional/readonly and declarations", () => {
  const { collect, selected, carrier, members } = scenario(-1);
  const facts = collect();
  assert.equal(Array.isArray(facts) && facts.length === 3, true, "complete member collection");
  assert.deepEqual(selected, [0, 1, 2]);
  assert.deepEqual(facts.map(member => member.sourceName), ["field0", "field1", "field2"], "Host order, never sorted");
  assert.equal(facts[0].type === carrier && facts[2].type === carrier, true, "exact native carrier identities");
  assert.equal(facts[1].optional, true);
  assert.equal(facts[2].readonly, true);
  assert.equal(facts.every((member, index) => member.origins?.[0]?.kind === "declared" &&
    member.origins[0].declaration === members[index].declarations[0] &&
    member.sourceDeclarations.includes(members[index].declarations[0])), true,
  "each native member keeps its Host declaration as origin");
  assert.equal(Object.isFrozen(facts) && facts.every(Object.isFrozen), true);
});

function nativeBinderFixture(projections) {
  const program = hostProgram("export interface View { read<T>(value: T | undefined): T; }");
  const declaration = program.nodes.find(node => program.ast.is.IsMethodSignatureDeclaration(node));
  assert.notEqual(declaration, undefined, "the authored method signature exists");
  const parameterDeclaration = program.ast.typeParameters(declaration)[0];
  const parameter = csharpSourceTypeParameter(parameterDeclaration, program.ast);
  assert.notEqual(parameter, undefined, "the authored binder has a C# identity");
  const storage = csharpOptionalStorageProjection(parameter);
  const operations = getCsharpGenericOptionalParts(storage).operations;
  const canonical = Object.freeze([operations, storage]);
  const reads = [];
  const services = representationServices(program, { genericProjections(owner) {
    reads.push(owner);
    return projections?.(canonical) ?? canonical;
  } });
  const member = program.facts.objects.members(program.type(program.named("View")))[0];
  assert.equal(member.kind === "method" && member.type.kind === "callable" && member.type.calls.length === 1, true);
  const signature = member.type.calls[0];
  return { signature, declaration, parameterDeclaration, parameter, canonical, reads,
    select: () => representSignatureTypeParameters(signature, csharpRepresentationContext(services, declaration, "type-argument")) };
}

test("method binders are the authored binder followed by the complete canonical projection vector, once", () => {
  const fixture = nativeBinderFixture();
  const selected = fixture.select();
  assert.equal(isCsharpRefusal(selected), false);
  assert.equal(selected.length === 3 && selected[0].identity === fixture.parameter.identity &&
    selected[1].identity === fixture.canonical[0].identity && selected[2].identity === fixture.canonical[1].identity, true,
  "authored, operations and storage binders keep the canonical order");
  assert.equal(selected[0].declaration === fixture.parameterDeclaration && selected[1].declaration === fixture.signature.declaration &&
    selected[2].declaration === fixture.signature.declaration, true, "projected binders keep the real method owner");
  assert.equal(selected[1].constraints === fixture.canonical[0].csharpProjectionConstraints &&
    selected[2].constraints === fixture.canonical[1].csharpProjectionConstraints, true,
  "projection constraints are the producer's identical frozen evidence");
  assert.equal(Object.isFrozen(selected) && selected.every(Object.isFrozen), true, "the binder vector is immutable");
  assert.equal(fixture.reads.length === 1 && fixture.reads[0] === fixture.signature.declaration, true,
    "the projection reader is asked once, with the selected method identity");
});

test("a duplicated canonical projection identity is refused, never silently deduplicated", () => {
  const fixture = nativeBinderFixture(canonical => [canonical[0], canonical[0]]);
  const selected = fixture.select();
  assert.equal(isCsharpRefusal(selected) && selected.code === "CSHARP_GENERIC_BINDER", true,
    "a duplicated native slot never publishes a partial ABI");
});
