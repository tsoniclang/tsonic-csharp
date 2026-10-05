import assert from "node:assert/strict";
import test from "node:test";
import { closeCsharpOwnerTypeParameterEnvironment, csharpObjectShapeTypeParameters,
  csharpFreeTypeParameterIdentities, visitCsharpTargetTypeParameters } from "../../../dist/target-model/types/generic-references.js";
import { snapshotCsharpTargetTypes } from "../../../dist/target-model/types/snapshot.js";
import { csharpTargetTypeComponents } from "../../../dist/target-model/types/components.js";
import { createCsharpMetadataBudget, maximumCsharpMetadataEntries, maximumCsharpMetadataDepth } from "../../../dist/target-model/metadata/immutable.js";
import { csharpSourceTypeParameter } from "../../../dist/target-model/names/type-parameters.js";
import { createCsharpTypeParameterEnvironment } from "../../../dist/policy/constraints/type-parameter-environment.js";
import { createStructuralObjectShapeTarget } from "../../../dist/policy/types/objects/object-shape-policy/construction.js";
import { substituteTargetTypeParameters } from "../../../dist/target-model/types/substitution.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../../dist/target-model/types/equality.js";
import { csharpObjectShapeContractKey } from "../../../dist/target-model/types/object-shape-identity.js";
import { csharpObjectShapesEqual } from "../../../dist/target-model/types/object-shape-equality.js";

const integer = Object.freeze({ kind: "source-primitive", name: "int32" });
const parameter = (identity, name = identity) => ({ kind: "type-parameter", identity, name });
const resolved = constraints => ({ kind: "resolved", constraints });
const container = element => ({ kind: "target-named", id: "Container", typeArguments: [element],
  csharpRender: { kind: "named", name: "Container" } });
const field = type => ({ sourceKey: { kind: "property", name: "value" }, sourceName: "value", targetName: "value", memberKind: "property", type });
const typeConstraint = type => ({ kind: "type", type });

test("nongeneric owners do not allocate or query a generic constraint environment", () => {
  const environment = () => { throw new Error("Nongeneric owners have no generic constraint query."); };
  const first = closeCsharpOwnerTypeParameterEnvironment([], environment);
  assert.equal(closeCsharpOwnerTypeParameterEnvironment([], environment) === first, true, "one immutable empty environment");
  assert.equal(Object.isFrozen(first), true);
  const owner = createStructuralObjectShapeTarget([field(integer)], undefined, environment);
  assert.equal(owner.typeArguments === undefined, true, "no generic arguments manufactured for nongeneric storage");
});

test("a captured binder retains transitive constraint parameters before native owner identity is chosen", () => {
  const outer = parameter("outer", "Outer");
  const payload = parameter("payload", "Payload");
  const calls = [];
  const environment = selected => {
    calls.push(selected.identity);
    return resolved(selected.identity === outer.identity ? [typeConstraint(container(payload))] : []);
  };
  const owner = createStructuralObjectShapeTarget([field(outer)], undefined, environment);
  assert.deepEqual(owner.typeArguments.map(type => type.identity), ["outer", "payload"]);
  assert.equal(owner.typeArguments[0].csharpConstraints.constraints[0].type.typeArguments[0].identity, payload.identity);
  assert.equal(Object.isFrozen(owner.typeArguments), true, "immutable owner argument environment");
  assert.equal(Object.isFrozen(owner.typeArguments[0].csharpConstraints.constraints[0].type.typeArguments), true);
  assert.equal(calls.includes(payload.identity), true, "constraint dependency classified at the producer");
  const different = createStructuralObjectShapeTarget([field(outer)], undefined, () => resolved([]));
  assert.notEqual(owner.id, different.id, "native constraints identify the generated owner contract");
});

test("transitive dependency diamonds and self-bounds are finite and keep source identities separate", () => {
  const outer = parameter("outer", "T");
  const left = parameter("left", "T");
  const right = parameter("right", "T");
  const leaf = parameter("leaf", "T");
  const facts = new Map([
    ["outer", resolved([typeConstraint(container(left)), typeConstraint(container(right)), typeConstraint(container(outer))])],
    ["left", resolved([typeConstraint(container(leaf))])],
    ["right", resolved([typeConstraint(container(leaf))])],
    ["leaf", resolved([])],
  ]);
  const selected = closeCsharpOwnerTypeParameterEnvironment([outer], parameter => facts.get(parameter.identity));
  assert.deepEqual(selected.map(parameter => parameter.identity), ["leaf", "left", "outer", "right"]);
  assert.equal(selected.every(parameter => Object.isFrozen(parameter.csharpConstraints)), true, "one finalized environment");
});

test("carrier identity remains binder identity while contradictory native owner evidence rejects", () => {
  const outer = parameter("outer", "Outer");
  const left = { ...outer, csharpConstraints: resolved([{ kind: "keyword", keyword: "class" }]) };
  const right = { ...outer, csharpConstraints: resolved([{ kind: "keyword", keyword: "struct" }]) };
  assert.equal(targetTypeRefEquals(left, right), true, "same exact native binder");
  assert.equal(targetTypeRefKey(left), targetTypeRefKey(right), "no replacement carrier identity");
  assert.throws(() => closeCsharpOwnerTypeParameterEnvironment([left, right], parameter => parameter.csharpConstraints),
    /conflicting constraint evidence/u);
  assert.throws(() => csharpObjectShapeTypeParameters([field({ kind: "tuple", elements: [left, right] })], []),
    /conflicting constraint evidence/u);
  const shape = type => ({ targetType: { kind: "target-named", id: "tsonic.shape:same", typeArguments: [type] },
    members: [field(type)] });
  assert.equal(csharpObjectShapesEqual(shape(left), shape(right)), false, "owner fact conflict is not merged");
  assert.notEqual(csharpObjectShapeContractKey(shape(left)), csharpObjectShapeContractKey(shape(right)));
  assert.equal(csharpTargetTypeComponents({ kind: "tuple", elements: [left, right] }).length, 2,
    "equal carrier keys must not discard distinct constraint evidence");
});

test("native owner snapshots preserve opaque source declaration identity and freeze constraint data", () => {
  const declaration = Object.create({ compilerOwned: true });
  declaration.parent = declaration;
  let reads = 0;
  Object.defineProperty(declaration, "kind", { get() { reads += 1; throw new Error("opaque source AST must not be traversed"); } });
  const payload = parameter("payload", "Payload");
  const source = { ...parameter("outer", "Outer"), csharpDeclaration: declaration,
    csharpConstraints: resolved([typeConstraint(container(payload)), { kind: "constructor" }]) };
  const [snapshot] = snapshotCsharpTargetTypes([source]);
  assert.equal(snapshot.csharpDeclaration === declaration, true, "exact original source Node handle");
  assert.equal(Object.isFrozen(declaration), false, "compiler-owned source Node is untouched");
  assert.equal(Object.isFrozen(snapshot.csharpConstraints.constraints[0].type.typeArguments[0]), true);
  source.csharpConstraints.constraints[0].type.typeArguments[0].name = "Changed";
  source.csharpConstraints.constraints.push({ kind: "keyword", keyword: "class" });
  assert.equal(snapshot.csharpConstraints.constraints[0].type.typeArguments[0].name, "Payload");
  assert.equal(snapshot.csharpConstraints.constraints.length, 2);
  assert.equal(reads, 0, "no structural AST traversal");
});

test("malformed constraints, cycles, sparse arrays and executable metadata reject without evaluation", () => {
  const outer = parameter("outer");
  const cyclic = { kind: "array" };
  cyclic.element = cyclic;
  const sparse = new Array(2);
  sparse[1] = { kind: "constructor" };
  let reads = 0;
  const accessor = { get constraints() { reads += 1; return []; }, kind: "resolved" };
  for (const malformed of [
    resolved([{ kind: "keyword", keyword: "any" }]), resolved([{ kind: "type", type: null }]),
    resolved([{ kind: "unknown" }]), resolved([{ kind: "constructor", extra: true }]),
    { ...resolved([]), extra: true }, resolved([typeConstraint(cyclic)]), resolved(sparse),
    { kind: "unsupported", reason: "" }, { kind: "resolved", constraints: null }, accessor,
  ]) {
    assert.throws(() => snapshotCsharpTargetTypes([{ ...outer, csharpConstraints: malformed }]), TypeError);
    assert.throws(() => closeCsharpOwnerTypeParameterEnvironment([outer], () => malformed), TypeError);
  }
  assert.equal(reads, 0, "constraint getters never execute");
  assert.throws(() => snapshotCsharpTargetTypes([{ ...outer, csharpDeclaration: null }]), TypeError);
});

test("source constraint resolution uses exact declaration identity once and seals native results", () => {
  const sourceFile = { path: "/src/value.ts" };
  const declaration = { name: "Outer", position: 10 };
  const ast = {
    is: { IsTypeParameterDeclaration: node => node === declaration },
    name: node => node.name, text: name => name, getSourceFile: () => sourceFile, getPath: file => file.path,
    kind: () => 22, pos: node => node.position, end: node => node.position + 5,
  };
  const outer = csharpSourceTypeParameter(declaration, ast);
  const input = resolved([typeConstraint(container(integer))]);
  let calls = 0;
  const environment = createCsharpTypeParameterEnvironment(ast, (node, parameter) => {
    assert.equal(node === declaration, true, "selected source declaration");
    assert.equal(parameter.identity, outer.identity, "exact selected binder");
    calls += 1;
    return input;
  });
  const first = environment(outer);
  input.constraints[0].type.typeArguments[0] = parameter("wrong");
  assert.equal(environment({ ...outer }) === first, true, "one cached native constraint contract");
  assert.equal(first.constraints[0].type.typeArguments[0].name, "int32", "immutable native constraint snapshot");
  assert.equal(calls, 1, "one producer query");
  assert.equal(environment({ ...outer, identity: "wrong" }).kind, "unsupported", "identity mismatch fails closed");
  assert.equal(environment(parameter("missing")).kind, "unsupported", "no guessed unconstrained binder");
});

test("outer substitutions update retained constraint dependencies without changing the declared binder", () => {
  const payload = parameter("payload");
  const outer = { ...parameter("outer"), csharpConstraints: resolved([typeConstraint(container(payload))]) };
  const selected = substituteTargetTypeParameters(outer, new Map([[payload.identity, integer]]));
  assert.equal(selected.identity, outer.identity, "the native binder itself remains exact");
  assert.equal(selected.csharpConstraints.constraints[0].type.typeArguments[0] === integer, true, "selected constraint substitution");
  assert.equal(outer.csharpConstraints.constraints[0].type.typeArguments[0] === payload, true, "source evidence untouched");
});

test("generic traversal and constraint snapshots share the existing finite work and depth budgets", () => {
  const budget = createCsharpMetadataBudget();
  for (const invalid of [NaN, Infinity, -1, 0.5]) {
    assert.throws(() => budget.reserve(invalid), TypeError);
    assert.throws(() => budget.reserve(1, invalid), TypeError);
  }
  budget.reserve(maximumCsharpMetadataEntries - 1);
  assert.throws(() => snapshotCsharpTargetTypes([parameter("outer")], budget), /finite resource budget/u,
    "snapshots do not reset a selected traversal budget");
  const excessive = new Array(maximumCsharpMetadataEntries + 1);
  assert.throws(() => csharpFreeTypeParameterIdentities(excessive), TypeError, "reject before pending allocation");
  assert.throws(() => closeCsharpOwnerTypeParameterEnvironment(excessive, () => resolved([])), TypeError);
  assert.throws(() => csharpTargetTypeComponents({ kind: "tuple", elements: excessive }), TypeError);
  let nested = parameter("outer");
  for (let depth = 0; depth <= maximumCsharpMetadataDepth; depth += 1) nested = { kind: "array", element: nested };
  assert.throws(() => visitCsharpTargetTypeParameters(nested, () => {}), TypeError, "physical walk depth guard");
  assert.throws(() => csharpFreeTypeParameterIdentities([nested]), TypeError, "scoped free walk depth guard");
  const cyclic = { kind: "array" };
  cyclic.element = cyclic;
  const parameters = [];
  visitCsharpTargetTypeParameters(cyclic, parameter => parameters.push(parameter.identity));
  assert.deepEqual(parameters, [], "a repeated physical carrier terminates without repeated work");
  assert.deepEqual([...csharpFreeTypeParameterIdentities([cyclic])], [], "scoped cycles terminate");
  assert.throws(() => snapshotCsharpTargetTypes([cyclic]), /cycle/u, "cyclic native metadata is never published");
});
