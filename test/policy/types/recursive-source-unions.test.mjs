import assert from "node:assert/strict";
import test from "node:test";
import { createCsharpTypeDefinitionRegistry } from "../../../dist/analysis/project-types/type-definitions.js";
import { csharpSourceUnionTargetType } from "../../../dist/target-model/types/source-union-definitions.js";
import { snapshotCsharpMetadata } from "../../../dist/target-model/metadata/immutable.js";
import { snapshotCsharpTargetTypes } from "../../../dist/target-model/types/snapshot.js";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { recursiveSourceUnionFiles, recursiveCollectionUnionFiles, recursiveCollectionUnionIdentitySource,
  recursiveGenericCollectionUnionFiles, recursiveOptionalCollectionUnionFiles, recursiveOptionalCollectionUnionJsFiles } from "../../../../tsonic/test/fixtures/recursive-source-unions.mjs";

const integer = { kind: "source-primitive", name: "int32" };
const parameter = { kind: "type-parameter", identity: "tree/Value", name: "Value" };
const reference = (name, argument = parameter) => csharpSourceUnionTargetType(`/src/${name}.ts`, name, [argument]);

test("recursive union references retain immutable exact generic arm contracts", () => {
  const registry = createCsharpTypeDefinitionRegistry();
  const tree = reference("Tree");
  const arms = [{ ...parameter }, { kind: "array", element: tree }];
  assert.equal(registry.registerSourceUnion({ carrier: tree, arms }), true);
  assert.equal(JSON.stringify(tree).includes("arms"), false);
  const sameName = { ...parameter, identity: "call/Value" };
  assert.deepEqual(registry.sourceUnionArms(reference("Tree", integer)), [integer, { kind: "array", element: reference("Tree", integer) }]);
  assert.deepEqual(registry.sourceUnionArms(reference("Tree", sameName)), [sameName, { kind: "array", element: reference("Tree", sameName) }]);
  const definitions = registry.seal();
  arms[0].name = "Changed";
  arms[1].element = integer;
  assert.equal(definitions.sourceUnionArms(tree)[0].name, "Value");
  assert.equal(definitions.sourceUnions()[0].arms[0].name, "Value");
  assert.equal(definitions.sourceUnionArms(tree)[1].element.id, tree.id);
  assert.ok(Object.isFrozen(definitions.sourceUnionArms(tree)));
  assert.ok(Object.isFrozen(definitions.sourceUnionArms(tree)[1].element.csharpRender));
  assert.ok(Object.isFrozen(definitions.sourceUnions()[0].carrier.typeArguments));
  assert.throws(() => registry.registerSourceUnion({ carrier: tree, arms }), /sealed/u);
  assert.equal(definitions.sourceUnionArms(reference("Missing")), undefined);
  assert.equal(definitions.sourceUnionArms(csharpSourceUnionTargetType("/src/Tree.ts", "Tree", [])), undefined);
});

test("union registration rejects incomplete, malformed and contradictory contracts transactionally", () => {
  const registry = createCsharpTypeDefinitionRegistry();
  const carrier = reference("Tree");
  const arms = [parameter, { kind: "array", element: carrier }];
  const valid = { carrier, arms };
  const sparse = new Array(2);
  sparse[1] = arms[1];
  let reads = 0;
  const accessor = Object.defineProperty({}, "carrier", { get() { reads += 1; return carrier; } });
  for (const bad of [null, {}, { ...valid, extra: true }, { ...valid, arms: sparse }, accessor,
    { ...valid, arms: [] }, { ...valid, arms: [null, arms[1]] }, { ...valid, arms: [parameter, parameter] },
    { ...valid, arms: [{}, arms[1]] }, { ...valid, carrier: reference("Tree", integer) },
    { ...valid, carrier: { ...carrier, typeArguments: [parameter, parameter] } }]) {
    assert.equal(registry.registerSourceUnion(bad), false);
    assert.equal(registry.sourceUnionArms(carrier), undefined);
  }
  assert.equal(reads, 0);
  assert.equal(registry.registerSourceUnion(valid), true);
  assert.equal(registry.registerSourceUnion({ ...valid, arms: arms.toReversed() }), false);
  assert.deepEqual(registry.sourceUnionArms(carrier), arms);
  const missing = reference("Missing");
  assert.equal(registry.registerSourceUnion({ carrier: reference("Holder"), arms: [integer, { kind: "array", element: missing }] }), true);
  assert.throws(() => registry.seal(), /undefined or incompatible/u);
  assert.equal(registry.registerSourceUnion({ carrier: missing, arms }), true);
  assert.ok(registry.seal());
});

test("immutable metadata rejects executable, cyclic and oversized data without evaluating it", () => {
  let reads = 0;
  const accessor = { get value() { reads += 1; return 1; } };
  const cyclic = {};
  cyclic.self = cyclic;
  for (const bad of [accessor, cyclic, [undefined, () => 0], new Array(0xffff_ffff), { [Symbol()]: 1 }]) {
    assert.throws(() => snapshotCsharpMetadata(bad), TypeError);
  }
  assert.equal(reads, 0);
  const shared = { value: 1 };
  const snapshot = snapshotCsharpMetadata([shared, shared]);
  assert.equal(snapshot[0], snapshot[1]);
  assert.notEqual(snapshot[0], shared);
  assert.ok(Object.isFrozen(snapshot[0]));
  assert.deepEqual(snapshotCsharpMetadata([NaN, Infinity]), [NaN, Infinity]);
});

test("type snapshots preserve exact source identities without executing nested metadata", () => {
  const identity = Object.create({ compilerOwned: true });
  identity.self = identity;
  let reads = 0;
  const carrier = { kind: "target-named", id: "test.Factory", csharpClassFactory: { declaration: identity, instance: integer } };
  const [snapshot] = snapshotCsharpTargetTypes([carrier]);
  assert.equal(snapshot.csharpClassFactory.declaration, identity);
  assert.notEqual(snapshot.csharpClassFactory, carrier.csharpClassFactory);
  assert.ok(Object.isFrozen(snapshot.csharpClassFactory));
  const accessor = { get declaration() { reads += 1; return identity; }, instance: integer };
  const deep = { ...carrier, csharpClassFactory: accessor };
  assert.throws(() => snapshotCsharpTargetTypes([deep]), TypeError);
  const registry = createCsharpTypeDefinitionRegistry();
  assert.equal(registry.registerSourceUnion({ carrier: reference("Invalid"), arms: [deep, integer] }), false);
  assert.equal(reads, 0);
  const cyclic = { ...carrier };
  cyclic.csharpBaseType = cyclic;
  assert.throws(() => snapshotCsharpTargetTypes([cyclic]), TypeError);
  let excessive = integer;
  for (let index = 0; index < 130; index += 1) excessive = { kind: "array", element: excessive };
  assert.throws(() => snapshotCsharpTargetTypes([excessive]), /budget/u);
});

for (const surface of [undefined, "js"]) {
  test(`recursive collection unions retain one absence state on ${surface ?? "native"} profile`, { timeout: 300_000 }, () => {
    const files = surface === undefined ? recursiveOptionalCollectionUnionFiles : recursiveOptionalCollectionUnionJsFiles;
    executeCsharpConstruction(compileCsharpSource({ surface, sourceText: files["index.ts"],
      files: { "tree.ts": files["tree.ts"] },
    }), `recursive-optional-collection-unions-${surface ?? "native"}`);
  });
  test(`recursive collection union templates preserve exact instantiations on ${surface ?? "native"} profile`, { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ surface, sourceText: recursiveGenericCollectionUnionFiles["index.ts"],
      files: { "tree.ts": recursiveGenericCollectionUnionFiles["tree.ts"] },
    }), `recursive-generic-collection-unions-${surface ?? "native"}`);
  });
  test(`recursive generic and mutually recursive unions execute on ${surface ?? "native"} profile`, { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ surface, sourceText: recursiveSourceUnionFiles["index.ts"],
      files: Object.fromEntries(Object.entries(recursiveSourceUnionFiles).filter(([name]) => name !== "index.ts")),
    }), `recursive-source-unions-${surface ?? "native"}`);
  });
}

for (const surface of [undefined, "js"]) {
  test(`recursive collection unions preserve native payloads on ${surface ?? "native"} profile`, { timeout: 300_000 }, () => {
    const sourceText = recursiveCollectionUnionFiles["index.ts"];
    executeCsharpConstruction(compileCsharpSource({ surface,
      sourceText: surface === undefined ? sourceText : `${sourceText.replace("export function run()", "function values()")}
${recursiveCollectionUnionIdentitySource}
export function run(): boolean { return values() && aliases(); }`,
      files: { "tree.ts": recursiveCollectionUnionFiles["tree.ts"] },
    }), `recursive-collection-unions-${surface ?? "native"}`);
  });
}
