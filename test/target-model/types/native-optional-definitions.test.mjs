import assert from "node:assert/strict";
import test from "node:test";
import { nativeOptionalStorageDefinitions } from "../../helpers/native-optional-storage.mjs";
import { csharpTargetNamedType } from "../../../dist/target-model/types/factories.js";
import { csharpOptionalProjectedType } from "../../../dist/target-model/types/projections.js";
import { resolveCsharpOptionalStorage, selectCsharpOptionalStorage } from "../../../dist/target-model/types/optional-storage.js";
import { applyCsharpNativeGenericType } from "../../../dist/target-model/types/native-generics.js";
import { csharpNullableTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { csharpAbsenceTargetType, csharpTsValueTargetType } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { csharpFreeTypeParameterIdentities } from "../../../dist/target-model/types/generic-references.js";
import { targetTypeRefKey } from "../../../dist/target-model/types/equality.js";
import { snapshotCsharpTargetTypes, isCsharpTargetTypeRef } from "../../../dist/target-model/types/snapshot.js";
import { substituteTargetTypeParameters } from "../../../dist/target-model/types/substitution.js";

const expectedNames = ["contract", "value", "nullableValue", "reference", "absence", "jsValue"];
const expectedArities = [2, 1, 1, 1, 0, 0];
const definitions = nativeOptionalStorageDefinitions("provider:Assembly/Optional");
const integer = Object.freeze({ kind: "source-primitive", name: "int64" });
const parameter = Object.freeze({ kind: "type-parameter", identity: "owner:Value", name: "Value",
  csharpConstraints: Object.freeze({ kind: "resolved", constraints: Object.freeze([]) }) });

test("optional recipes retain the entire acquired definition domain and exact original binder vectors", () => {
  assert.deepEqual(Object.keys(definitions), expectedNames, "all six acquired Native definitions are mandatory");
  assert.deepEqual(expectedNames.map(name => definitions[name].parameters.length), expectedArities);
  const layout = selectCsharpOptionalStorage(parameter, definitions);
  assert.deepEqual(layout.requirements.map(value => value.csharpProjection.part), ["storage", "operations"],
    "the complete ordered Native helper domain precedes every per-helper assertion");
  for (const requirement of layout.requirements) {
    assert.equal(requirement.csharpProjection.definitions === definitions, true, "one acquired definition set");
    assert.deepEqual(requirement.csharpProjection.arguments, [parameter]);
    assert.equal(isCsharpTargetTypeRef(requirement), true, "complete valid Native helper metadata");
  }
  const contract = layout.operations.csharpConstraints.constraints.find(value => value.kind === "type").type;
  assert.equal(contract.id, definitions.contract.carrier.id, "actual provider-qualified interface identity");
  assert.deepEqual(contract.typeArguments, [parameter, layout.carrier], "exact payload and storage order");
  assert.deepEqual(csharpFreeTypeParameterIdentities([layout.carrier, layout.operations]),
    new Set([parameter.identity, layout.carrier.identity, layout.operations.identity]),
    "complete free Native requirements exclude every acquired template-local binder");
  assert.throws(() => csharpNullableTargetType(parameter), /acquired optional-storage definitions/,
    "the removed definition-free open optional constructor is not a second path");
});

test("closed optional applications preserve actual Native operation definitions without name normalization", () => {
  const reference = csharpTargetNamedType("provider:Assembly/Record", [], { kind: "named", name: "Record" },
    { allowsRefLikeTypeArguments: [], constraintRequiresReferenceType: true });
  const referenceParameter = { ...parameter, csharpConstraints: { kind: "resolved", constraints: [{ kind: "keyword", keyword: "class" }] } };
  const valueParameter = { ...parameter, csharpConstraints: { kind: "resolved", constraints: [{ kind: "keyword", keyword: "struct" }] } };
  const cases = [
    ["value", integer, "value", [integer]],
    ["nullable-value", csharpNullableTargetType(integer), "nullableValue", [integer]],
    ["reference", reference, "reference", [reference]],
    ["bounded-reference", referenceParameter, "reference", [referenceParameter]],
    ["bounded-value", valueParameter, "value", [valueParameter]],
    ["absence", csharpAbsenceTargetType(), "absence", []],
    ["closed-js", csharpTsValueTargetType(), "jsValue", []],
  ];
  assert.deepEqual(cases.map(([label]) => label),
    ["value", "nullable-value", "reference", "bounded-reference", "bounded-value", "absence", "closed-js"]);
  for (const [label, payload, key, arguments_] of cases) {
    const layout = selectCsharpOptionalStorage(payload, definitions);
    assert.equal(layout.operations.id, definitions[key].carrier.id, `${label}: actual acquired identity`);
    assert.deepEqual(layout.operations.typeArguments, arguments_, `${label}: ordered unboxed payload`);
    assert.equal(layout.operations.csharpRender === definitions[key].carrier.csharpRender, true, `${label}: exact Native render metadata`);
    assert.equal(layout.operations.csharpValueType, true, `${label}: existing Native struct operations`);
    assert.equal(layout.requirements.some(value => value.csharpProjection !== undefined), false, `${label}: no open helper requirement`);
  }
});

test("optional snapshots and substitutions retain all six acquired definitions and their local scopes", () => {
  const layout = selectCsharpOptionalStorage(parameter, definitions);
  const snapshot = snapshotCsharpTargetTypes([layout.carrier, layout.operations]);
  assert.equal(snapshot.length, 2, "storage and operations remain a complete pair");
  for (const [index, requirement] of snapshot.entries()) {
    assert.equal(Object.isFrozen(requirement), true);
    assert.deepEqual(Object.keys(requirement.csharpProjection.definitions), expectedNames);
    assert.equal(targetTypeRefKey(requirement, "emission"), targetTypeRefKey(layout.requirements[index], "emission"));
    for (const name of expectedNames) {
      const actual = requirement.csharpProjection.definitions[name];
      assert.equal(actual.carrier.id, definitions[name].carrier.id, name);
      assert.deepEqual(actual.parameters, definitions[name].parameters, name);
      assert.equal(Object.isFrozen(actual.carrier), true, name);
    }
  }
  const inner = { ...parameter, identity: "owner:Inner", name: "Inner" };
  const substituted = substituteTargetTypeParameters(layout.operations, new Map([[parameter.identity, inner]]));
  assert.equal(substituted.csharpProjection.definitions === definitions, true, "same original acquired templates after application");
  assert.equal(substituted.csharpProjection.arguments[0] === inner, true, "actual selected payload");
  assert.deepEqual(csharpFreeTypeParameterIdentities([substituted]),
    new Set([inner.identity, substituted.identity, selectCsharpOptionalStorage(inner, definitions).carrier.identity]));
  const closed = substituteTargetTypeParameters(substituted, new Map([[inner.identity, integer]]));
  assert.equal(closed.id, definitions.value.carrier.id);
  assert.deepEqual(closed.typeArguments, [integer]);
  assert.equal(layout.operations.csharpProjection.arguments[0] === parameter, true, "immutable original recipe");
});

test("every optional definition participates in validation and emission identity", () => {
  const original = csharpOptionalProjectedType({ kind: "optional", part: "operations", arguments: [parameter], definitions });
  const foreign = nativeOptionalStorageDefinitions("foreign:Assembly/Optional");
  assert.deepEqual(Object.keys(definitions), expectedNames);
  for (const [index, name] of expectedNames.entries()) {
    const replaced = { ...definitions, [name]: foreign[name] };
    const changed = csharpOptionalProjectedType({ ...original.csharpProjection, definitions: replaced });
    assert.notEqual(targetTypeRefKey(original, "emission"), targetTypeRefKey(changed, "emission"), `${name}: physical provenance retained`);
    assert.equal(isCsharpTargetTypeRef(changed), true, `${name}: genuine foreign definition remains structurally valid`);
    const missing = { ...definitions };
    delete missing[name];
    assert.equal(isCsharpTargetTypeRef({ ...original, csharpProjection: { ...original.csharpProjection, definitions: missing } }), false,
      `${name}: omission cannot pass a truncated inventory`);
    const extra = Object.freeze({ ...parameter, identity: `invalid:${name}`, name: "Extra" });
    const invalid = { ...definitions[name], parameters: [...definitions[name].parameters, extra.identity],
      carrier: { ...definitions[name].carrier, typeArguments: [...(definitions[name].carrier.typeArguments ?? []), extra],
        csharpAllowsRefLikeTypeArguments: Array.from({ length: expectedArities[index] + 1 }, () => false) } };
    assert.equal(isCsharpTargetTypeRef({ ...original, csharpProjection: { ...original.csharpProjection,
      definitions: { ...definitions, [name]: invalid } } }), false, `${name}: mutually consistent but wrong protocol arity is rejected`);
  }
  assert.throws(() => applyCsharpNativeGenericType(definitions.contract, [integer]), /exact ordered argument vector/);
  assert.equal(isCsharpTargetTypeRef({ ...original, csharpProjection: { kind: "optional", part: "operations", arguments: [parameter] } }), false,
    "the superseded incomplete projection form is rejected");
});

test("native protocol metadata substitutes the same optional requirements through every result component", () => {
  const layout = selectCsharpOptionalStorage(parameter, definitions);
  const carrier = csharpTargetNamedType("provider:Protocol", [], { kind: "named", name: "Protocol" }, {
    allowsRefLikeTypeArguments: [], generatorProtocol: { kind: "sync", yieldType: layout.carrier, returnType: layout.operations, nextType: parameter },
    iteratorResultProtocol: { yieldType: layout.carrier, returnType: layout.operations },
  });
  const selected = substituteTargetTypeParameters(carrier, new Map([[parameter.identity, integer]]));
  const expected = selectCsharpOptionalStorage(integer, definitions);
  assert.equal(selected.csharpGeneratorProtocol.kind, "sync");
  assert.equal(targetTypeRefKey(selected.csharpGeneratorProtocol.yieldType), targetTypeRefKey(expected.carrier));
  assert.equal(targetTypeRefKey(selected.csharpGeneratorProtocol.returnType), targetTypeRefKey(expected.operations));
  assert.equal(selected.csharpGeneratorProtocol.nextType === integer, true);
  assert.equal(targetTypeRefKey(selected.csharpIteratorResultProtocol.yieldType), targetTypeRefKey(expected.carrier));
  assert.equal(targetTypeRefKey(selected.csharpIteratorResultProtocol.returnType), targetTypeRefKey(expected.operations));
  assert.equal(resolveCsharpOptionalStorage(layout.operations.csharpProjection, integer).id, definitions.value.carrier.id);
});
