import assert from "node:assert/strict";
import test from "node:test";
import { providerVirtualDeclarationFactKey, sourcePrimitiveFactKey } from "@tsonic/tsts";
import { resolveProviderObjectLiteralShape } from "../../../dist/policy/types/objects/object-shape-policy/provider-construction.js";
import { csharpNullableTargetType } from "../../../dist/target-model/types/nullable.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";

const integer = Object.freeze({ kind: "source-primitive", name: "int64" });
const floating = Object.freeze({ kind: "source-primitive", name: "float64" });
const selectedTarget = Object.freeze({ kind: "target-named", id: "native.Counters" });

function fixture(options = {}) {
  const type = {};
  const propertyType = {};
  const propertySymbol = {};
  const rootSymbol = {};
  const declaration = { name: {} };
  const typeFact = {};
  const memberFact = {};
  const selectedMember = options.memberType ?? integer;
  const binding = { target: "csharp", id: selectedTarget.id, csharpType: selectedTarget };
  const sourceIdentity = { providerId: "fixture", providerVersion: "1", providerModuleId: "module",
    moduleSpecifier: "fixture", exportId: "counter", exportName: "Counters" };
  const typeRelation = { kind: "type", targetBinding: binding, source: { kind: "type", ...sourceIdentity },
    bindingTypeParameters: [], objectLiteralConstruction: { kind: "object-initializer" }, ...options.typeRelation };
  const memberRelation = { kind: "member", targetBinding: binding,
    source: { kind: "member", ...sourceIdentity, memberId: "counter.value", memberStatic: false,
      memberKey: { kind: "property-key", name: "value" }, ...options.memberSource },
    targetMember: { kind: "field", id: "native.value", sourceName: "value", targetName: "nativeValue",
      declaringType: selectedTarget, parameters: [], returnType: selectedMember, ...options.targetMember },
    receiver: { kind: "instance" }, bindingTypeParameters: [], bindingTypeArgumentSource: "receiver",
    ...options.memberRelation };
  const factOwner = options.rootFact ? rootSymbol : propertySymbol;
  const property = { name: "value", symbol: propertySymbol, rootSymbols: options.rootFact ? [rootSymbol] : [],
    type: propertyType, optional: options.optional ?? false, readonly: options.readonly ?? false };
  const input = {
    type, selectedTarget: options.selectedTarget ?? selectedTarget, state: { depth: 0 },
    queries: {
      facts: { typeSubjects: actual => actual === type ? [type] : [propertyType] },
      declarations: { symbolDeclarations: symbol => symbol === propertySymbol ? [declaration] : [] },
      types: { propertyInfos: () => [property], isUnion: () => false, isNullish: () => false,
        isNumberLike: () => true },
    },
    host: {
      ast: { name: subject => subject.name, is: { IsComputedPropertyName: () => false } },
      sourceFacts: { getFact(subject, key) {
        if (key === providerVirtualDeclarationFactKey) {
          if (subject === type && !options.missingTypeFact) return typeFact;
          if (subject === factOwner && !options.missingMemberFact) return memberFact;
        }
        return key === sourcePrimitiveFactKey && options.primitiveFact && subject === propertyType
          ? { name: "float64" } : undefined;
      } },
      providers: {
        resolveType: () => options.typeResolution ?? { kind: "resolved", relations: [typeRelation] },
        resolveMember: () => options.memberResolution ?? { kind: "resolved", relations: [memberRelation] },
      },
    },
    resolvePropertyType: () => options.sourceType ?? selectedMember,
  };
  return { input, type, propertyType, propertySymbol, rootSymbol, declaration, memberRelation, typeRelation };
}

test("provider construction retains its exact destination type and native field identity", () => {
  const value = fixture();
  const shape = resolveProviderObjectLiteralShape(value.input);
  assert.equal(shape?.sourceType === value.type, true, "opaque checked destination identity");
  assert.equal(shape?.targetType === selectedTarget, true, "no replacement native carrier");
  assert.equal(shape?.constructible, true);
  assert.equal(shape?.members[0].targetName, "nativeValue");
  assert.equal(shape?.members[0].type === integer, true, "native int64 is not floating-point storage");
  assert.equal(shape?.members[0].sourceSubjects.length, 2);
  assert.equal(shape?.members[0].sourceSubjects[0] === value.propertySymbol, true);
  assert.equal(shape?.members[0].sourceSubjects[1] === value.declaration, true);
  assert.equal(Object.isFrozen(shape?.members[0].sourceSubjects), true);
});

test("provider construction resolves root-symbol facts without property-name matching", () => {
  const value = fixture({ rootFact: true });
  const shape = resolveProviderObjectLiteralShape(value.input);
  assert.equal(shape?.members.length, 1);
  assert.equal(shape.members[0].sourceSubjects.length, 3);
  assert.equal(shape.members[0].sourceSubjects[0] === value.propertySymbol, true);
  assert.equal(shape.members[0].sourceSubjects[1] === value.rootSymbol, true);
  assert.equal(shape.members[0].sourceSubjects[2] === value.declaration, true);
  assert.equal(shape.members[0].sourceTypes[0] === value.propertyType, true, "selected checker field type");
});

test("optional provider fields preserve exact native integer storage and one absence", () => {
  const optionalInteger = csharpNullableTargetType(integer);
  const value = fixture({ optional: true, sourceType: integer, memberType: optionalInteger });
  const shape = resolveProviderObjectLiteralShape(value.input);
  assert.equal(shape?.members[0].optional, true);
  assert.equal(targetTypeRefEquals(shape?.members[0].type, optionalInteger), true,
    "the exact immutable native carrier survives type-parameter substitution");
  assert.equal(resolveProviderObjectLiteralShape(fixture({ optional: true, memberType: integer }).input) === undefined,
    true, "optional source cannot occupy nonnullable native storage");
});

test("only unannotated numeric provider declarations select the exact native numeric field", () => {
  const shape = resolveProviderObjectLiteralShape(fixture({ sourceType: floating }).input);
  assert.equal(shape?.members[0].exactNumericStorage, true);
  assert.equal(shape?.members[0].type === integer, true, "full-width native integer selected at the producer");
  assert.equal(resolveProviderObjectLiteralShape(fixture({ sourceType: floating, primitiveFact: true }).input) === undefined,
    true, "explicit source numeric metadata is authoritative");
});

test("provider construction fails closed on missing, contradictory or unrelated native relations", () => {
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
    assert.equal(resolveProviderObjectLiteralShape(fixture(options).input) === undefined, true, `relation control ${index}`);
  }
});

test("provider construction rejects two distinct field bindings for the same exact source identity", () => {
  const value = fixture();
  value.input.host.providers.resolveMember = () => ({ kind: "resolved", relations: [
    value.memberRelation,
    { ...value.memberRelation, targetMember: { ...value.memberRelation.targetMember, targetName: "otherValue" } },
  ] });
  assert.equal(resolveProviderObjectLiteralShape(value.input) === undefined, true, "contradictory native field selection");
});
