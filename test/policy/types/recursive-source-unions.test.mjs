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
import { createCsharpObjectShapeMemberResolver } from "../../../dist/analysis/objects/shapes/member-evidence.js";
import { checkCsharpSource, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { createTargetSourceProgram, sourceTypeDescriptorMemberOriginsEqual, sourceTypeDescriptorStructure } from "@tsonic/target-api/source";
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
  const checked = checkCsharpSource({ sourceText: `
import type { int32 } from "@tsonic/core/types.js";
interface Slot { value: int32; }
class Owner {}
type Mapped = { [K in "value"]: int32 };
declare const key: unique symbol;
const actual: Slot = { value: 1 };
` });
  assert.equal(checked.sourceDiagnosticsText, "");
  const source = createTargetSourceProgram(checked.source);
  const nodes = [];
  const visit = node => { nodes.push(node); source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); }); };
  source.navigation.sourceFiles.forEach(visit);
  const literal = nodes.find(node => source.ast.is.IsObjectLiteralExpression(node));
  const owner = nodes.find(node => source.ast.is.IsClassDeclaration(node) && source.ast.text(source.ast.name(node)) === "Owner");
  const mappedAlias = nodes.find(node => source.ast.is.IsTypeAliasDeclaration(node) && source.ast.text(source.ast.name(node)) === "Mapped");
  const mapped = source.ast.typeNode(mappedAlias);
  const key = nodes.find(node => source.ast.is.IsVariableDeclaration(node) && source.ast.text(source.ast.name(node)) === "key");
  assert.equal(owner !== undefined && mapped !== undefined && source.ast.is.IsMappedTypeNode(mapped) && key !== undefined, true,
    "origin identity controls retain the actual class, mapped owner and unique-symbol declaration");
  const base = source.effectiveTypes.get(literal);
  assert.equal(base !== undefined && base.kind !== "refused", true, "the identical literal is published by the Host");
  let publication = base;
  const actualQueries = source.semantics.forNode(literal);
  const queries = { ...actualQueries, types: new Proxy({}, { get() {
    return assert.fail("canonical snapshots cannot reopen raw checker member evidence");
  } }) };
  const resolver = createCsharpObjectShapeMemberResolver({ ast: source.ast, navigation: source.navigation,
    effectiveTypes: { get: node => node === literal ? publication : undefined },
    hasSemantics: file => source.semantics.includes(file), semantics: () => queries, semanticsFor: () => queries,
    sourceStorage: { memberSubjectFor: () => undefined }, memoryBindings: { hasBoundField: () => false },
    representations: { genericProjections: () => [] }, typeResolver: { resolveDescriptor: descriptor => {
      const selected = sourceTypeDescriptorStructure(descriptor);
      assert.equal(selected.kind === "primitive" && selected.primitive === "int32", true, "the actual published width");
      return integer;
    } },
  });
  const descriptor = resolver.publishedShapeDescriptor(literal);
  const members = resolver.deriveMembers(descriptor, literal, queries, { depth: 0 });
  assert.equal(members?.length === 1, true, "the complete canonical member inventory");
  const targetType = { kind: "target-named", id: "test.CanonicalMember", csharpAllowsRefLikeTypeArguments: [] };
  const union = csharpRuntimeUnionTargetType([targetType, integer], [{ targetType, members }, undefined]);
  const [snapshot] = snapshotCsharpTargetTypes([union]);
  const member = snapshot.csharpRuntimeUnionObjectShapes[0].members[0];
  const instantiate = selected => resolver.retainPublishedMembers([selected], descriptor, literal, queries, { depth: 0 });
  const selected = instantiate(member);
  assert.equal(selected?.length === 1 && selected[0].type === integer && selected[0].origins.length === 1 &&
    sourceTypeDescriptorMemberOriginsEqual(selected[0].origins[0], members[0].origins[0]), true,
    "copied correspondence retains the same checked source member and exact Native width");
  for (const changed of [
    { ...member, origins: undefined },
    { ...member, origins: [{ kind: "declared", declaration: owner }] },
    { ...member, origins: [{ kind: "declared", declaration: source.ast.properties(literal)[0] }] },
    { ...member, type: { kind: "source-primitive", name: "int64" } },
  ]) assert.equal(instantiate(changed) === undefined, true, "foreign or stale checked evidence never certifies a member");
  publication = { ...base, provenance: { ...base.provenance, occurrence: owner } };
  assert.equal(instantiate(member) === undefined, true, "a different producer occurrence cannot reuse this snapshot");
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
      copied.origins[0] !== origin && Object.isFrozen(copied.origins) && Object.isFrozen(copied.origins[0]), true,
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
