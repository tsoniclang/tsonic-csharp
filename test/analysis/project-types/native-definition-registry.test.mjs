import assert from "node:assert/strict";
import test from "node:test";
import { createCsharpTypeDefinitionRegistry } from "../../../dist/analysis/project-types/type-definitions.js";
import { csharpTargetNamedType } from "../../../dist/target-model/types/factories.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";
import { csharpNativeCallableTargetMember } from "../../../dist/target-model/types/native-declaration-operations.js";

const integer = Object.freeze({ kind: "source-primitive", name: "int64" });
const unsigned = Object.freeze({ kind: "source-primitive", name: "uint64" });
const binder = identity => Object.freeze({ kind: "type-parameter", identity, name: "Value",
  csharpConstraints: Object.freeze({ kind: "resolved", constraints: Object.freeze([]) }) });
const named = (identity, arguments_ = []) => Object.freeze(csharpTargetNamedType(identity, Object.freeze([...arguments_]),
  Object.freeze({ kind: "named", name: "SameName" }), { allowsRefLikeTypeArguments: arguments_.map(() => false) }));

function publish(definitions, definition) {
  const transaction = definitions.begin();
  transaction.reserve(definition.carrier.id);
  try {
    transaction.complete(definition);
    return transaction.commit()[0];
  } catch (error) {
    transaction.abort();
    throw error;
  }
}

test("generated Native heritage publishes the same immutable physical interface vector", () => {
  const definitions = createCsharpTypeDefinitionRegistry(() => undefined);
  const parameter = binder("definition:Value");
  const carrier = named("definition:Role", [parameter]);
  assert.equal(definitions.nativeDeclarationKind(carrier), undefined, "missing metadata before production");
  const contract = named("runtime:ISourceUnionRole`2", [parameter, integer]);
  const row = publish(definitions, { carrier, parameters: [parameter], kind: "struct", members: [], supertypes: [contract] });
  assert.equal(definitions.nativeSupertypes(carrier) === row.supertypes, true, "emitted and checked vector identity");
  assert.equal(definitions.nativeDeclarationKind(carrier), "struct");
  assert.equal(Object.isFrozen(row), true, "immutable definition");
  assert.equal(Object.isFrozen(row.parameters), true, "immutable ordered binders");
  assert.equal(Object.isFrozen(row.supertypes), true, "immutable interfaces");
  assert.equal(publish(definitions, row) === row, true, "one canonical definition");
  const sealed = definitions.seal();
  assert.equal(sealed.nativeSupertypes(carrier) === row.supertypes, true, "same sealed vector");
  assert.equal(sealed.nativeDeclarationKind(named("foreign:Role", [parameter])), undefined, "foreign same-name carrier");
  assert.equal(sealed.nativeSupertypes(named("foreign:Role", [parameter])), undefined, "foreign heritage missing");
  assert.equal(sealed.nativeDeclarationKind(named("unknown:Late")), undefined, "sealed missing remains missing");
  assert.throws(() => publish(definitions, { carrier: named("definition:Late"), parameters: [], kind: "struct", members: [], supertypes: [] }),
    /before sealing/, "no producer after sealing");
});

test("generated Native heritage substitutes exact ordered binder identities", () => {
  const definitions = createCsharpTypeDefinitionRegistry(() => undefined);
  const first = binder("definition:First");
  const second = binder("definition:Second");
  const carrier = named("definition:Pair", [first, second]);
  publish(definitions, { carrier, parameters: [first, second], kind: "struct", members: [],
    supertypes: [named("runtime:Contract`2", [second, first])] });
  const selected = definitions.nativeSupertypes(named(carrier.id, [integer, unsigned]));
  assert.equal(selected.length, 1, "one actual contract");
  assert.equal(targetTypeRefEquals(selected[0], named("runtime:Contract`2", [unsigned, integer])), true, "original binder order");
  const reordered = definitions.nativeSupertypes(named(carrier.id, [unsigned, integer]));
  assert.equal(targetTypeRefEquals(reordered[0], named("runtime:Contract`2", [integer, unsigned])), true, "reordered application stays distinct");
  assert.equal(definitions.nativeSupertypes(named(carrier.id, [integer])), undefined, "missing argument");
  assert.equal(definitions.nativeSupertypes(named(carrier.id, [integer, unsigned, integer])), undefined, "extra argument");
});

test("one Native definition rejects same-name foreign binders and competing interfaces", () => {
  const definitions = createCsharpTypeDefinitionRegistry(() => undefined);
  const original = binder("definition:Original");
  const foreign = binder("foreign:Original");
  const carrier = named("definition:Witness", [original]);
  const row = publish(definitions, { carrier, parameters: [original], kind: "struct", members: [],
    supertypes: [named("runtime:OriginalContract`1", [original])] });
  assert.throws(() => publish(definitions, { ...row,
    supertypes: [named("runtime:OriginalContract`1", [foreign])] }), /exact ordered binders/, "foreign free identity");
  assert.throws(() => publish(definitions, { ...row, carrier: named(carrier.id, [foreign]), parameters: [foreign],
    supertypes: [named("runtime:OriginalContract`1", [foreign])] }), /competing binders/, "same name is not identity");
  assert.throws(() => publish(definitions, { ...row,
    supertypes: [named("foreign:OriginalContract`1", [original])] }), /competing binders/, "foreign physical contract");
  assert.equal(definitions.nativeSupertypes(carrier) === row.supertypes, true, "failed receiving leaves original row unchanged");
});

test("Native hierarchy references remain finite across cycles without name-based satisfaction", () => {
  const definitions = createCsharpTypeDefinitionRegistry(() => undefined);
  const first = named("definition:First");
  const second = named("definition:Second");
  publish(definitions, { carrier: first, parameters: [], kind: "interface", members: [], supertypes: [second] });
  publish(definitions, { carrier: second, parameters: [], kind: "interface", members: [], supertypes: [first] });
  const sealed = definitions.seal();
  assert.equal(sealed.nativeSupertypes(first)[0] === second, true, "first exact edge");
  assert.equal(sealed.nativeSupertypes(second)[0] === first, true, "second exact edge");
  assert.equal(sealed.nativeSupertypes(named("foreign:First")), undefined, "no same-name cycle entry");
});

function completeInventory() {
  const parameter = binder("definition:Inventory/Value");
  const methodParameter = binder("definition:Inventory/Dispatch/Item");
  const carrier = named("definition:Inventory", [parameter]);
  const physical = (id, kind, type, parameters = [], metadata = {}) => ({ id, kind, sourceName: id, targetName: id,
    declaringType: carrier, parameters, returnType: type, ...metadata });
  const field = physical("Value", "field", parameter, [], { readonly: true });
  const getter = physical("Read", "property", parameter, [], { csharpReturnPassing: "byref-readonly" });
  const setter = physical("Write", "property", parameter);
  const indexer = physical("Item", "indexer", parameter, [{ name: "index", type: integer, passingMode: "by-value" }]);
  const dispatch = Object.freeze({ name: "Dispatch", typeParameters: Object.freeze([{ identity: methodParameter.identity, name: methodParameter.name,
    constraints: Object.freeze([{ kind: "type", type: parameter }]) }]), signature: Object.freeze({ kind: "call",
    receiver: Object.freeze({ type: carrier, passingMode: "byref-readwrite" }),
    parameters: Object.freeze([parameter, { kind: "array", element: methodParameter }]),
    parameterPassingModes: Object.freeze(["byref-readonly", "by-value"]), returnType: methodParameter,
    returnPassing: "byref-readwrite", restParameterIndex: 1 }) });
  const dispatchMember = csharpNativeCallableTargetMember(carrier, dispatch,
    [{ name: "receiver", ...dispatch.signature.receiver }, { name: "value", type: parameter, passingMode: "byref-readonly" },
      { name: "rest", type: dispatch.signature.parameters[1], passingMode: "by-value", paramsArray: true }], false);
  const overload = { name: "Dispatch", typeParameters: [], signature: { kind: "call", parameters: [integer],
    parameterPassingModes: ["by-value"], returnType: integer } };
  const overloadMember = { ...csharpNativeCallableTargetMember(carrier, overload,
    [{ name: "value", type: integer, passingMode: "by-value" }], false), id: "definition:Inventory/Dispatch/int64" };
  return { parameter, methodParameter, carrier, definition: { carrier, kind: "struct", parameters: [parameter], supertypes: [], members: [
    { kind: "slot", member: field, storage: { type: parameter, readonly: true },
      read: { member: field, type: parameter, passingMode: "by-value" }, write: undefined },
    { kind: "slot", member: getter, storage: undefined, read: { member: getter, type: parameter, passingMode: "byref-readonly" }, write: undefined },
    { kind: "slot", member: setter, storage: undefined, read: undefined, write: { member: setter, type: parameter, passingMode: "by-value" } },
    { kind: "slot", member: indexer, storage: undefined, read: { member: indexer, type: parameter, passingMode: "by-value" },
      write: { member: indexer, type: parameter, passingMode: "by-value" } },
    { kind: "callable", member: dispatchMember, method: dispatch, value: dispatch },
    { kind: "callable", member: overloadMember, method: overload, value: undefined },
  ] } };
}

test("one Native declaration retains every field, independent accessor and complete generic overload ABI", () => {
  const registry = createCsharpTypeDefinitionRegistry(() => undefined);
  const fixture = completeInventory();
  const definition = publish(registry, fixture.definition);
  assert.deepEqual(definition.members.map(entry => entry.member.id),
    ["Value", "Read", "Write", "Item", fixture.definition.members[4].member.id, "definition:Inventory/Dispatch/int64"],
    "the complete expected six-member domain is required before inspecting any slot or overload");
  const application = registry.nativeDeclaration(named(fixture.carrier.id, [integer]));
  assert.equal(application.definition === definition, true, "one immutable declaration for all applications");
  assert.equal(application.members.length, 6, "no accessor or overloaded method is filtered away");
  for (const [index, entry] of application.members.entries()) {
    assert.equal(Object.isFrozen(entry), true, `${index}: immutable member`);
    assert.equal(Object.isFrozen(entry.member.parameters), true, `${index}: immutable Native parameters`);
    assert.equal(targetTypeRefEquals(entry.member.declaringType, application.carrier), true, `${index}: actual applied owner`);
  }
  const [field, getter, setter, indexer, dispatch, overload] = application.members;
  assert.equal(targetTypeRefEquals(field.storage.type, integer), true);
  assert.equal(field.storage.readonly, true);
  assert.equal(field.write === undefined, true, "readonly storage has no invented write operation");
  assert.equal(getter.storage === undefined && getter.write === undefined, true, "getter has no invented field or setter");
  assert.equal(getter.read.passingMode, "byref-readonly");
  assert.equal(setter.storage === undefined && setter.read === undefined, true, "write-only property has no invented getter");
  assert.equal(targetTypeRefEquals(setter.write.type, integer), true);
  assert.equal(indexer.member.parameters.length, 1);
  assert.equal(indexer.member.parameters[0].type === integer, true, "actual index ABI is not a Source key inference");
  assert.equal(targetTypeRefEquals(indexer.read.type, integer) && targetTypeRefEquals(indexer.write.type, integer), true);
  assert.equal(dispatch.method.typeParameters.length, 1, "method binder remains local");
  assert.equal(dispatch.method.typeParameters[0].identity, fixture.methodParameter.identity);
  assert.equal(dispatch.method.typeParameters[0].constraints[0].type === integer, true, "outer binding applies inside method constraints");
  assert.deepEqual(dispatch.method.signature.parameterPassingModes, ["byref-readonly", "by-value"]);
  assert.equal(dispatch.method.signature.receiver.passingMode, "byref-readwrite");
  assert.equal(targetTypeRefEquals(dispatch.method.signature.receiver.type, application.carrier), true);
  assert.equal(dispatch.method.signature.returnType.identity, fixture.methodParameter.identity);
  assert.equal(dispatch.method.signature.returnPassing, "byref-readwrite");
  assert.equal(dispatch.method.signature.restParameterIndex, 1);
  assert.equal(dispatch.value.name, "Dispatch", "separate supplied callable-value member is preserved");
  assert.equal(overload.member.targetName, "Dispatch", "same-name physical overload stays in the full inventory");
  assert.equal(overload.value === undefined, true, "method metadata does not invent a value/body adapter");
  fixture.definition.members[0].storage.readonly = false;
  fixture.definition.members.pop();
  assert.equal(definition.members.length, 6, "later producer mutation cannot truncate a completed domain");
  assert.equal(definition.members[0].storage.readonly, true, "later mutation cannot change original Native storage");
});

test("Native transactions never publish partial, aborted or contradictory member inventories", () => {
  const registry = createCsharpTypeDefinitionRegistry(() => undefined);
  const first = named("transaction:First");
  const second = named("transaction:Second");
  const transaction = registry.begin();
  transaction.reserve(first.id);
  transaction.reserve(second.id);
  transaction.complete({ carrier: first, kind: "struct", parameters: [], supertypes: [], members: [] });
  assert.equal(registry.nativeDeclaration(first) === undefined, true, "a reserved complete row remains private before commit");
  assert.equal(registry.nativeDeclaration(second) === undefined, true, "a reservation alone is never metadata success");
  assert.throws(() => registry.seal(), /reserved transaction/);
  assert.throws(() => transaction.commit(), /Every reserved Native declaration/);
  assert.equal(registry.nativeDeclaration(first) === undefined, true, "failed multi-row publication is atomic");
  const aborted = registry.begin();
  aborted.reserve(first.id);
  aborted.complete({ carrier: first, kind: "struct", parameters: [], supertypes: [], members: [] });
  aborted.abort();
  assert.equal(registry.nativeDeclaration(first) === undefined, true, "explicit abort retains no completed row");
  const fixture = completeInventory();
  const row = publish(registry, fixture.definition);
  const changed = fixture.definition.members.map(entry => entry.member.id !== "Write" ? entry : { ...entry,
    read: { member: entry.member, type: fixture.parameter, passingMode: "by-value" } });
  assert.throws(() => publish(registry, { ...fixture.definition, members: changed }), /competing binders/,
    "independent accessor presence participates in exact declaration identity");
  assert.equal(registry.nativeDeclaration(fixture.carrier).definition === row, true);
  registry.seal();
  assert.throws(() => registry.begin(), /before sealing/);
});

test("complete Native declaration admission validates original binders and supplied physical member ABI", () => {
  const cases = [
    ["unfinalized definition binder", fixture => ({ ...fixture.definition, parameters: [{ ...fixture.parameter, csharpConstraints: undefined }] })],
    ["duplicate physical member", fixture => ({ ...fixture.definition, members: [...fixture.definition.members, fixture.definition.members[0]] })],
    ["readonly field write", fixture => ({ ...fixture.definition, members: fixture.definition.members.map((entry, index) => index !== 0 ? entry : {
      ...entry, write: { member: entry.member, type: fixture.parameter, passingMode: "by-value" } }) })],
    ["field storage ABI", fixture => ({ ...fixture.definition, members: fixture.definition.members.map((entry, index) => index !== 0 ? entry : {
      ...entry, storage: { ...entry.storage, type: unsigned } }) })],
    ["callable passing vector", fixture => ({ ...fixture.definition, members: fixture.definition.members.map((entry, index) => index !== 4 ? entry : {
      ...entry, method: { ...entry.method, signature: { ...entry.method.signature, parameterPassingModes: ["by-value", "by-value"] } } }) })],
    ["foreign method constraint", fixture => ({ ...fixture.definition, members: fixture.definition.members.map((entry, index) => index !== 4 ? entry : {
      ...entry, method: { ...entry.method, typeParameters: [{ ...entry.method.typeParameters[0], constraints: [{ kind: "type", type: binder("foreign:Hidden") }] }] } }) })],
  ];
  assert.deepEqual(cases.map(([label]) => label), ["unfinalized definition binder", "duplicate physical member", "readonly field write",
    "field storage ABI", "callable passing vector", "foreign method constraint"]);
  for (const [label, malformed] of cases) {
    const registry = createCsharpTypeDefinitionRegistry(() => undefined);
    const fixture = completeInventory();
    assert.throws(() => publish(registry, malformed(fixture)), TypeError, label);
    assert.equal(registry.nativeDeclaration(fixture.carrier) === undefined, true, `${label}: no partially completed result`);
  }
});
