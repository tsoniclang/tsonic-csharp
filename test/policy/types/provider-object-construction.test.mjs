// Provider object-literal construction from Host object facts (nextgen C-2542 §2, G8, R2, I6; AGENT-C1-NOTES §5
// item 4). The deleted objects/shapes/provider-construction.ts read checker property infos and root symbols. Its
// successor (requested of the C writer, AGENT-C3-NOTES-F5 R-F5-1) builds the shape of a literal whose destination is a
// CLR provider type from:
//   - facts.objects.members(descriptor): the Source members, in Host order, with their declarations;
//   - the provider-virtual declaration fact of the type and of each member declaration -> providers.resolveType /
//     providers.resolveMember: the CLR type and field binding;
//   - the one representation of each member's Host type, which must equal the field's .NET type exactly.
// Every missing, contradictory or unrelated relation is a CSHARP_PROVIDER_CONSTRUCTION refusal, never a fallback.
import assert from "node:assert/strict";
import test from "node:test";
import { providerVirtualDeclarationFactKey } from "@tsonic/tsts";
import { hostProgram, representationServices } from "../../representation/host-fixture.mjs";
import { representCsharpProviderObjectShape } from "../../../dist/analysis/objects/shapes/provider-shapes.js";
import { csharpRepresentationContext, isCsharpRefusal, representSourceType } from "../../../dist/representation/index.js";
import { csharpNullableTargetType, csharpSourcePrimitiveTargetType, targetTypeRefEquals } from "../../../dist/target-model/types/index.js";

const integer = csharpSourcePrimitiveTargetType("int64");
const selectedTarget = Object.freeze({ kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "native.Counters" });

function fixture(options = {}) {
  const annotation = options.annotation ?? "int64";
  const fields = `${options.readonly ? "readonly " : ""}value${options.optional ? "?" : ""}: ${annotation}`;
  const ownerText = options.rootFact ? `interface Original { ${fields}; } type Counters = Pick<Original, "value">;`
    : `interface Counters { ${fields}; }`;
  const program = hostProgram(`import type { int64, float64 } from "@tsonic/core/types.js"; ${ownerText}
    interface Other { value: number; }
    declare const current: Counters; declare const foreign: Other;
    export function read(): Counters { return current; } export function readForeign(): Other { return foreign; }`);
  const returned = name => program.nodes.find(node => program.ast.is.IsIdentifier(node) && program.ast.text(node) === name &&
    program.ast.is.IsReturnStatement(program.ast.parent(node)));
  const occurrence = returned("current");
  const descriptor = program.type(occurrence);
  assert.equal(descriptor.kind, "declared", "the Source owner publishes its declared descriptor");
  const members = program.facts.objects.members(descriptor);
  assert.equal(Array.isArray(members) && members.length === 1, true, "the Host publishes the one member");
  const declaration = members[0].declarations[0];
  const typeFact = {};
  const memberFact = {};
  const binding = { target: "csharp", id: selectedTarget.id, csharpType: selectedTarget };
  const sourceIdentity = { providerId: "fixture", providerVersion: "1", providerModuleId: "module",
    moduleSpecifier: "fixture", exportId: "counter", exportName: "Counters" };
  const typeRelation = { kind: "type", targetBinding: binding, source: { kind: "type", ...sourceIdentity },
    bindingTypeParameters: [], objectLiteralConstruction: { kind: "object-initializer" }, ...options.typeRelation };
  const memberRelation = { kind: "member", targetBinding: binding,
    source: { kind: "member", ...sourceIdentity, memberId: "counter.value", memberStatic: false,
      memberKey: { kind: "property-key", name: "value" }, ...options.memberSource },
    targetMember: { kind: "field", id: "native.value", sourceName: "value", targetName: "nativeValue",
      declaringType: selectedTarget, parameters: [], returnType: options.memberType ?? integer, ...options.targetMember },
    receiver: { kind: "instance" }, bindingTypeParameters: [], bindingTypeArgumentSource: "receiver", ...options.memberRelation };
  const sourceFacts = { getFact(subject, key) {
    if (key === providerVirtualDeclarationFactKey) {
      if (subject === descriptor.declaration && !options.missingTypeFact) return typeFact;
      if (subject === declaration && !options.missingMemberFact) return memberFact;
    }
    return program.host.sourceFacts.getFact(subject, key);
  } };
  const providers = {
    resolveType: fact => { assert.equal(fact === typeFact, true, "the exact type fact is resolved"); return options.typeResolution ?? { kind: "resolved", relations: [typeRelation] }; },
    resolveMember: fact => { assert.equal(fact === memberFact, true, "the exact member fact is resolved"); return options.memberResolution ?? { kind: "resolved", relations: [memberRelation] }; },
  };
  const services = representationServices(program);
  const input = { facts: program.facts, syntax: program.ast, sourceFacts, providers,
    represent: (type, at) => representSourceType(type, csharpRepresentationContext(services, at, "storage")) };
  const select = (selected = descriptor, carrier = options.selectedTarget ?? selectedTarget) =>
    representCsharpProviderObjectShape(input, selected, occurrence, carrier);
  return { program, input, select, declaration, descriptor, members, memberRelation, foreign: returned("foreign") };
}

test("provider construction keeps its exact destination type and native field identity", () => {
  const value = fixture();
  const shape = value.select();
  assert.equal(isCsharpRefusal(shape), false);
  assert.equal(shape.targetType === selectedTarget, true, "no replacement native carrier");
  assert.equal(shape.constructible, true);
  assert.equal(shape.members[0].targetName, "nativeValue", "the CLR field name from the provider relation");
  assert.equal(targetTypeRefEquals(shape.members[0].type, integer), true, "native int64 is not floating-point storage");
  assert.equal(shape.members[0].sourceDeclarations.length === 1 && shape.members[0].sourceDeclarations[0] === value.declaration, true,
    "the member keeps its Host declaration");
  assert.equal(Object.isFrozen(shape.members[0].sourceDeclarations), true);
});

test("a mapped member resolves the fact on its original declaration, without property-name matching", () => {
  const value = fixture({ rootFact: true });
  assert.equal(value.program.ast.is.IsPropertySignatureDeclaration(value.declaration), true,
    "the Host lists the original interface property as the Pick member's declaration");
  const shape = value.select();
  assert.equal(isCsharpRefusal(shape), false);
  assert.equal(shape.members.length === 1 && shape.members[0].sourceDeclarations[0] === value.declaration, true);
});

test("optional provider fields keep exact native integer storage and one absence", () => {
  const optionalInteger = csharpNullableTargetType(integer);
  const shape = fixture({ optional: true, memberType: optionalInteger }).select();
  assert.equal(isCsharpRefusal(shape), false);
  assert.equal(shape.members[0].optional, true);
  assert.equal(targetTypeRefEquals(shape.members[0].type, optionalInteger), true);
  const refused = fixture({ optional: true, memberType: integer }).select();
  assert.equal(isCsharpRefusal(refused) && refused.code === "CSHARP_PROVIDER_CONSTRUCTION", true,
    "an optional source member cannot occupy non-nullable native storage");
});

test("provider construction requires the exact published numeric field width", () => {
  for (const annotation of ["number", "float64"]) {
    const refused = fixture({ annotation }).select();
    assert.equal(isCsharpRefusal(refused) && refused.code === "CSHARP_PROVIDER_CONSTRUCTION", true,
      `${annotation}: a float64 member cannot select an int64 native field`);
  }
});

test("provider construction refuses missing, contradictory or unrelated native relations", () => {
  const cases = [
    { missingTypeFact: true },
    { missingMemberFact: true },
    { selectedTarget: { ...selectedTarget, id: "native.Other" } },
    { typeResolution: { kind: "missing" } },
    { memberResolution: { kind: "missing" } },
    { typeRelation: { objectLiteralConstruction: undefined } },
    { targetMember: { declaringType: { ...selectedTarget, id: "native.Other" } } },
    { targetMember: { returnType: undefined } },
    { memberSource: { memberKey: { kind: "property-key", name: "other" } } },
    { targetMember: { readonly: true } },
    { memberSource: { memberStatic: true } },
    { targetMember: { static: true } },
    { memberRelation: { receiver: { kind: "none" } } },
    { targetMember: { parameters: [{ name: "index", type: integer, passingMode: "by-value" }] } },
  ];
  for (const [index, options] of cases.entries()) {
    const refused = fixture(options).select();
    assert.equal(isCsharpRefusal(refused) && refused.code === "CSHARP_PROVIDER_CONSTRUCTION", true, `relation control ${index}`);
  }
});

// RC2 #5, signed Q92: the object-initializer readonly rule is what C# can assign. A CLR member without a public setter
// (`readonly` from HasPublicSetter / IsInitOnly) is refused with the C# code CSHARP_PROVIDER_CONSTRUCTION (I7),
// whatever the Source modifier; a writable CLR member is assigned, also for a Source `readonly` member.
test("Q92: provider readonly follows C# assignability, with a CSHARP_ refusal", () => {
  const writable = fixture({ readonly: true }).select();
  assert.equal(isCsharpRefusal(writable), false, "Source readonly + writable CLR member: the initializer assigns it");
  for (const options of [{ readonly: true, targetMember: { readonly: true } }, { targetMember: { readonly: true } }]) {
    const refused = fixture(options).select();
    assert.equal(isCsharpRefusal(refused) && refused.code === "CSHARP_PROVIDER_CONSTRUCTION", true,
      `${options.readonly ? "Source readonly" : "Source writable"} + read-only CLR member: refused with the C# code`);
  }
});

test("two distinct field bindings for one Source member are refused", () => {
  const value = fixture();
  value.input.providers.resolveMember = () => ({ kind: "resolved", relations: [
    value.memberRelation,
    { ...value.memberRelation, targetMember: { ...value.memberRelation.targetMember, targetName: "otherValue" } },
  ] });
  assert.equal(isCsharpRefusal(value.select()), true, "contradictory native field selection");
});

test("provider construction reads the Host members of its own descriptor only", () => {
  const value = fixture();
  const other = value.program.type(value.foreign);
  const refused = value.select(other);
  assert.equal(isCsharpRefusal(refused), true, "another owner's same-named field is not this provider type's member");
  const facts = { ...value.program.facts, objects: { ...value.program.facts.objects, members: () => [...value.members, ...value.members] } };
  assert.equal(isCsharpRefusal(representCsharpProviderObjectShape({ ...value.input, facts }, value.descriptor,
    value.program.byText("current"), selectedTarget)), true, "an ambiguous Host inventory is not rebuilt");
});
