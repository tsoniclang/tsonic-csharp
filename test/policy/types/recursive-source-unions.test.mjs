import assert from "node:assert/strict";
import test from "node:test";
import { createCsharpTypeDefinitionRegistry } from "../../../dist/analysis/project-types/type-definitions.js";
import { csharpSourceUnionTargetType } from "../../../dist/target-model/types/source-union-definitions.js";
import { snapshotCsharpMetadata } from "../../../dist/target-model/metadata/immutable.js";
import { snapshotCsharpTargetTypes } from "../../../dist/target-model/types/snapshot.js";
import { csharpRuntimeUnionTargetType } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { createCsharpObjectShapeMemberResolver } from "../../../dist/analysis/objects/shapes/member-evidence.js";
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
  const carrier = { kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "test.Factory", csharpClassFactory: { declaration: identity, instance: integer } };
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

function memberEvidenceUnion(kind = "present", templateDepth = 0) {
  let reads = 0;
  const handles = [];
  const identity = () => {
    const handle = Object.create({ compilerOwned: true });
    handle.self = handle;
    Object.defineProperty(handle, "poison", { get() { reads += 1; throw new Error("compiler identity must stay opaque"); } });
    handles.push(handle);
    return handle;
  };
  const ownerType = identity();
  const sourceType = identity();
  const side = receiverType => ({ receiverType, property: { name: "value", symbol: identity(),
    type: identity(), rootSymbols: [identity(), identity()], optional: kind === "absent", readonly: false },
    declarations: [identity()], getters: [identity()], setters: [identity()], read: "property" });
  const destination = side(ownerType);
  const correspondence = { kind, destination, ...(kind === "present" ? { source: side(sourceType) } : {}) };
  const evidence = { ownerType, sourceType, correspondence };
  const member = { sourceKey: { kind: "property", name: "value" }, sourceName: "value", targetName: "value",
    memberKind: "property", type: integer, optional: kind === "absent", sourceSubjects: [destination.property.symbol],
    sourceDeclarations: destination.declarations, sourceTypes: [destination.property.type], sourceMemberEvidence: [evidence] };
  const targetType = { kind: "target-named", id: "test.MemberEvidence", csharpAllowsRefLikeTypeArguments: [] };
  let shape = { targetType, sourceType, members: [member] };
  for (let depth = 0; depth < templateDepth; depth += 1) shape = { ...shape, declarationTemplate: shape };
  return { union: csharpRuntimeUnionTargetType([targetType, integer], [shape, undefined]), shape, member, evidence,
    handles, reads: () => reads };
}

test("union member evidence snapshots freeze data shells and preserve only exact compiler identities", () => {
  for (const kind of ["present", "absent"]) {
    for (const depth of [0, 1, 2]) {
      const fixture = memberEvidenceUnion(kind, depth);
      const [snapshot] = snapshotCsharpTargetTypes([fixture.union]);
      let shape = snapshot.csharpRuntimeUnionObjectShapes[0];
      for (let level = 0; level <= depth; level += 1) {
        const member = shape.members[0];
        const evidence = member.sourceMemberEvidence[0];
        assert.equal(evidence.ownerType === fixture.evidence.ownerType, true, "checked owner Type identity");
        assert.equal(evidence.sourceType === fixture.evidence.sourceType, true, "checked source Type identity");
        for (const [actual, original] of [[shape, fixture.shape], [member, fixture.member], [evidence, fixture.evidence],
          [evidence.correspondence, fixture.evidence.correspondence]]) {
          assert.equal(actual !== original && Object.isFrozen(actual), true, "ordinary evidence shell is copied and frozen");
        }
        assert.equal(evidence.correspondence.kind, kind, "present/absent discriminant stays data");
        for (const name of kind === "present" ? ["source", "destination"] : ["destination"]) {
          const actual = evidence.correspondence[name];
          const original = fixture.evidence.correspondence[name];
          assert.equal(actual !== original && Object.isFrozen(actual), true, "correspondence side is a frozen data shell");
          assert.equal(actual.property !== original.property && Object.isFrozen(actual.property), true, "property flags stay data");
          assert.equal(actual.receiverType === original.receiverType, true, "checked receiver Type identity");
          for (const field of ["symbol", "type"]) assert.equal(actual.property[field] === original.property[field], true, `checked property ${field}`);
          for (const field of ["rootSymbols", "declarations", "getters", "setters"]) {
            const actualList = field === "rootSymbols" ? actual.property[field] : actual[field];
            const originalList = field === "rootSymbols" ? original.property[field] : original[field];
            assert.equal(actualList !== originalList && Object.isFrozen(actualList), true, `${field} list is copied and frozen`);
            assert.equal(actualList.length === originalList.length && actualList.every((entry, index) => entry === originalList[index]),
              true, `${field} entries retain exact compiler identity`);
          }
        }
        if (level < depth) shape = shape.declarationTemplate;
      }
      fixture.evidence.correspondence.destination.property.readonly = true;
      assert.equal(shape.members[0].sourceMemberEvidence[0].correspondence.destination.property.readonly, false,
        "changing the original ordinary flag cannot change its snapshot");
      assert.equal(fixture.handles.every(handle => !Object.isFrozen(handle)), true, "compiler objects are not frozen or rewritten");
      assert.equal(fixture.reads(), 0, "cyclic poisoned compiler handles are never traversed");
    }
  }
});

test("union evidence wrappers and unrecognized identity paths remain strict immutable data", () => {
  let reads = 0;
  const getter = Object.defineProperty({}, "ownerType", { get() { reads += 1; return {}; } });
  const cyclic = {};
  cyclic.self = cyclic;
  for (const invalid of [getter, cyclic, { execute: () => 0 }]) {
    const fixture = memberEvidenceUnion();
    fixture.member.sourceMemberEvidence = [invalid];
    assert.throws(() => snapshotCsharpTargetTypes([fixture.union]), TypeError);
  }
  for (const mutate of [
    fixture => { fixture.member.sourceMemberEvidence = { 0: fixture.evidence }; },
    fixture => { fixture.evidence.correspondence.extra = fixture.evidence.ownerType; },
    fixture => { fixture.evidence.correspondence.destination.property.extra = fixture.evidence.ownerType; },
    fixture => { fixture.evidence.correspondence.destination.property.rootSymbols = { 0: fixture.evidence.ownerType }; },
    fixture => { fixture.evidence.correspondence.destination.declarations = { 0: fixture.evidence.ownerType }; },
    fixture => { fixture.member.sourceMemberEvidence = new Array(1); },
    fixture => { fixture.evidence.correspondence = Object.defineProperty({}, "source", { get() { reads += 1; return {}; } }); },
  ]) {
    const fixture = memberEvidenceUnion();
    mutate(fixture);
    assert.throws(() => snapshotCsharpTargetTypes([fixture.union]), TypeError);
    assert.equal(fixture.reads(), 0, "invalid metadata cannot traverse a compiler handle");
  }
  assert.equal(reads, 0, "ordinary metadata accessors are rejected without execution");
});

test("snapshotted member evidence still rejects foreign and stale checked correspondence", () => {
  const fixture = memberEvidenceUnion();
  const [snapshot] = snapshotCsharpTargetTypes([fixture.union]);
  const member = snapshot.csharpRuntimeUnionObjectShapes[0].members[0];
  const { evidence } = fixture;
  const queries = { declarations: { typeSymbol: () => undefined }, types: {
    structuralMembers: (source, owner) => source === evidence.sourceType && owner === evidence.ownerType
      ? { kind: "available", members: [evidence.correspondence] } : { kind: "unavailable" },
  } };
  const resolver = createCsharpObjectShapeMemberResolver({});
  const instantiate = selected => resolver.instantiateMemberEvidence([selected], evidence.sourceType, queries, evidence.sourceType);
  assert.equal(instantiate(member)?.[0].sourceTypes[0] === evidence.correspondence.source.property.type, true,
    "copied correspondence retains the same checked source member");
  for (const changed of [
    { ...evidence, ownerType: fixture.handles[2] },
    { ...evidence, sourceType: fixture.handles[2] },
    { ...evidence, correspondence: { ...evidence.correspondence, destination: { ...evidence.correspondence.destination,
      property: { ...evidence.correspondence.destination.property, symbol: fixture.handles[3] } } } },
    { ...evidence, correspondence: { ...evidence.correspondence, source: { ...evidence.correspondence.source,
      declarations: [fixture.handles[2]] } } },
  ]) assert.equal(instantiate({ ...member, sourceMemberEvidence: [changed] }) === undefined, true,
    "foreign or stale checked evidence never certifies a member");
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
