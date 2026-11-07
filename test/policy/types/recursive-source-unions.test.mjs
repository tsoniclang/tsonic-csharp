import assert from "node:assert/strict";
import test from "node:test";
import { CsharpMetadataResourceLimitFailure } from "../../../dist/target-model/metadata/immutable.js";
import { TargetCompilerResourceLimitFailure } from "@tsonic/target-api/artifacts";
import { csharpMetadataResourceFailure } from "../../../dist/backend/compile.js";
import { createCsharpTypeDefinitionRegistry } from "../../../dist/analysis/project-types/type-definitions.js";
import { csharpSourceUnionTargetType } from "../../../dist/target-model/types/source-union-definitions.js";
import { snapshotCsharpMetadata } from "../../../dist/target-model/metadata/immutable.js";
import { snapshotCsharpTargetTypes } from "../../../dist/target-model/types/snapshot.js";
import { csharpRuntimeUnionTargetType } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { hostProgram, representationServices, represented } from "../../representation/host-fixture.mjs";
import { csharpRepresentationContext, representObject } from "../../../dist/representation/index.js";
import { checkCsharpSource, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { sourceTypeDescriptorMemberOriginsEqual } from "@tsonic/target-api/source";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { recursiveSourceUnionFiles, recursiveCollectionUnionFiles, recursiveCollectionUnionIdentitySource,
  recursiveGenericCollectionUnionFiles, recursiveOptionalCollectionUnionFiles, recursiveOptionalCollectionUnionJsFiles } from "../../../../tsonic/test/fixtures/recursive-source-unions.mjs";

const integer = { kind: "source-primitive", name: "int32" };
const parameter = { kind: "type-parameter", identity: "tree/Value", name: "Value" };
const reference = (name, argument = parameter) => csharpSourceUnionTargetType(`/src/${name}.ts`, name, [argument]);

function metadataResourceLimit(failure, dimension, limit) {
  const resource = csharpMetadataResourceFailure(failure);
  return failure instanceof CsharpMetadataResourceLimitFailure && failure.dimension === dimension && failure.limit === limit &&
    resource instanceof TargetCompilerResourceLimitFailure && resource.diagnostic.code === "TSONIC_COMPILER_RESOURCE_LIMIT" &&
    resource.diagnostic.evidence?.[0] === `${dimension}=${limit}`;
}

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
  assert.throws(() => snapshotCsharpTargetTypes([excessive]), failure => metadataResourceLimit(failure, "depth", 128));
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
  const entries = kind === "present" ? [destination, side(sourceType)] : [destination];
  const origins = [{ kind: "declared", declaration: destination.declarations[0] },
    { kind: "class-prototype", owner: identity() },
    { kind: "mapped", owner: identity(), key: { kind: "string", value: "value" } },
    { kind: "mapped", owner: identity(), key: { kind: "number", value: 1 } },
    { kind: "mapped", owner: identity(), key: { kind: "unique-symbol", declaration: identity() } }];
  const member = { sourceKey: { kind: "property", name: "value" }, sourceName: "value", targetName: "value",
    memberKind: "property", type: integer, optional: kind === "absent", readonly: false, origins,
    sourceSubjects: entries.flatMap(entry => [entry.property.symbol, ...entry.property.rootSymbols]),
    sourceDeclarations: entries.flatMap(entry => [...entry.declarations, ...entry.getters, ...entry.setters]) };
  const targetType = { kind: "target-named", id: "test.MemberEvidence", csharpAllowsRefLikeTypeArguments: [] };
  let shape = { targetType, members: [member] };
  for (let depth = 0; depth < templateDepth; depth += 1) shape = { ...shape, declarationTemplate: shape };
  return { union: csharpRuntimeUnionTargetType([targetType, integer], [shape, undefined]), shape, member, ownerType, sourceType,
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
        for (const [actual, original] of [[shape, fixture.shape], [member, fixture.member], [member.origins, fixture.member.origins]]) {
          assert.equal(actual !== original && Object.isFrozen(actual), true, "ordinary evidence shell is copied and frozen");
        }
        assert.equal(member.optional, kind === "absent", "present/absent member optionality stays data");
        for (const field of ["sourceSubjects", "sourceDeclarations"]) {
          const actualList = member[field];
          const originalList = fixture.member[field];
          assert.equal(actualList !== originalList && Object.isFrozen(actualList), true, `${field} list is copied and frozen`);
          assert.equal(actualList.length === originalList.length && actualList.every((entry, index) => entry === originalList[index]),
            true, `${field} entries retain exact compiler identity`);
        }
        assert.equal(member.origins.length, fixture.member.origins.length, "the complete declared/prototype/mapped inventory survives");
        for (const [index, actual] of member.origins.entries()) {
          const original = fixture.member.origins[index];
          assert.equal(actual !== original && Object.isFrozen(actual) && actual.kind === original.kind, true,
            "each canonical origin shell is copied and frozen");
          assert.equal(actual.kind === "declared" ? actual.declaration === original.declaration : actual.owner === original.owner, true,
            "canonical declaration or owner Node identity");
          if (actual.kind === "mapped") {
            assert.equal(actual.key !== original.key && Object.isFrozen(actual.key) && actual.key.kind === original.key.kind, true,
              "each mapped key shell is copied and frozen");
            assert.equal(actual.key.kind === "unique-symbol" ? actual.key.declaration === original.key.declaration
              : actual.key.value === original.key.value, true, "mapped keys preserve scalar values or opaque unique-symbol identity");
          }
        }
        if (level < depth) shape = shape.declarationTemplate;
      }
      fixture.member.readonly = true;
      assert.equal(shape.members[0].readonly, false,
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
    fixture.member.origins = [invalid];
    assert.throws(() => snapshotCsharpTargetTypes([fixture.union]), TypeError);
  }
  for (const mutate of [
    fixture => { fixture.member.origins = { 0: fixture.member.origins[0] }; },
    fixture => { fixture.member.origins[0].extra = fixture.ownerType; },
    fixture => { fixture.member.origins[2].key.extra = fixture.ownerType; },
    fixture => { fixture.member.sourceSubjects = { 0: fixture.ownerType }; },
    fixture => { fixture.member.sourceDeclarations = { 0: fixture.ownerType }; },
    fixture => { fixture.member.origins = new Array(1); },
    fixture => { fixture.member.origins[2].key = Object.defineProperty({}, "value", { get() { reads += 1; return {}; } }); },
  ]) {
    const fixture = memberEvidenceUnion();
    mutate(fixture);
    assert.throws(() => snapshotCsharpTargetTypes([fixture.union]), TypeError);
    assert.equal(fixture.reads(), 0, "invalid metadata cannot traverse a compiler handle");
  }
  const retired = memberEvidenceUnion();
  retired.member.sourceMemberEvidence = [{ ownerType: retired.ownerType }];
  assert.throws(() => snapshotCsharpTargetTypes([retired.union]), TypeError,
    "retired raw evidence has no compiler-identity transport exception");
  assert.equal(retired.reads(), 0, "the rejected retired schema cannot execute a compiler handle");
  for (const retire of [fixture => { fixture.member.sourceTypes = [fixture.ownerType]; }, fixture => { fixture.shape.sourceType = fixture.sourceType; }]) {
    const checkerFields = memberEvidenceUnion();
    retire(checkerFields);
    assert.throws(() => snapshotCsharpTargetTypes([checkerFields.union]), TypeError,
      "target-model shapes carry no checker Type fields (I2; C1 removed sourceType/sourceTypes)");
    assert.equal(checkerFields.reads(), 0);
  }
  assert.equal(reads, 0, "ordinary metadata accessors are rejected without execution");
});

test("snapshotted members keep the Host member origins and copy only data shells", () => {
  const program = hostProgram(`
import type { int32 } from "@tsonic/core/types.js";
interface Slot { value: int32; }
class Owner {}
type Mapped = { [K in "value"]: int32 };
declare const key: unique symbol;
const actual: Slot = { value: 1 };
`);
  const { ast, nodes, facts } = program;
  const literal = nodes.find(node => ast.is.IsObjectLiteralExpression(node));
  const owner = program.named("Owner", node => ast.is.IsClassDeclaration(node));
  const mapped = ast.typeNode(program.named("Mapped", node => ast.is.IsTypeAliasDeclaration(node)));
  const key = program.named("key", node => ast.is.IsVariableDeclaration(node));
  assert.equal(ast.is.IsMappedTypeNode(mapped), true, "the origin controls use the real class, mapped owner and unique-symbol declaration");
  const slot = program.slot(program.named("actual", node => ast.is.IsVariableDeclaration(node)));
  const published = facts.objects.members(slot);
  assert.equal(Array.isArray(published) && published.length === 1, true, "the complete Host member inventory");
  let retained;
  const services = representationServices(program, { shapes: Object.freeze({ retainShape: shape => { retained = shape; return shape; },
    resolveCallableValue: () => assert.fail("no callable member") }) });
  represented(representObject(slot, published, csharpRepresentationContext(services, literal, "storage")));
  const members = retained.members;
  assert.equal(members.length === 1 && members[0].type.name === "int32" &&
    members[0].origins?.length === 1 && members[0].origins[0].declaration === published[0].declarations[0], true,
  "the shape member keeps the Host declaration origin and the exact int32 width");
  const targetType = { kind: "target-named", id: "test.CanonicalMember", csharpAllowsRefLikeTypeArguments: [] };
  for (const origin of [members[0].origins[0], { kind: "class-prototype", owner },
    { kind: "mapped", owner: mapped, key: { kind: "string", value: "value" } },
    { kind: "mapped", owner: mapped, key: { kind: "number", value: 1 } },
    { kind: "mapped", owner: mapped, key: { kind: "unique-symbol", declaration: key } }]) {
    const handles = origin.kind === "declared" ? [origin.declaration] : origin.kind === "mapped" && origin.key.kind === "unique-symbol"
      ? [origin.owner, origin.key.declaration] : [origin.owner];
    const frozen = handles.map(handle => Object.isFrozen(handle));
    const input = csharpRuntimeUnionTargetType([targetType, integer], [{ targetType,
      members: [{ ...members[0], origins: [origin] }] }, undefined]);
    const copied = snapshotCsharpTargetTypes([input])[0].csharpRuntimeUnionObjectShapes[0].members[0];
    assert.equal(copied.origins !== input.csharpRuntimeUnionObjectShapes[0].members[0].origins &&
      (Object.isFrozen(origin) || copied.origins[0] !== origin) &&
      Object.isFrozen(copied.origins) && Object.isFrozen(copied.origins[0]), true,
      "canonical origin vectors and ordinary shells are copied and frozen");
    assert.equal(sourceTypeDescriptorMemberOriginsEqual(copied.origins[0], origin), true,
      "declared/prototype/mapped owner and unique-symbol Node identities remain opaque");
    assert.equal(handles.every((handle, index) => Object.isFrozen(handle) === frozen[index]), true,
      "snapshots do not freeze or rewrite compiler-owned nodes");
  }
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
