import assert from "node:assert/strict";
import test from "node:test";
import { createCsharpTypeDefinitionRegistry } from "../../../dist/analysis/project-types/type-definitions.js";
import { csharpTargetNamedType } from "../../../dist/target-model/types/factories.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";

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
