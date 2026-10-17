import assert from "node:assert/strict";
import test from "node:test";
import { closeCsharpOwnerTypeParameterEnvironment, csharpObjectShapeTypeParameters,
  csharpFreeTypeParameterIdentities, visitCsharpTargetTypeParameters } from "../../../dist/target-model/types/generic-references.js";
import { isCsharpTargetTypeRef, snapshotCsharpTargetTypes } from "../../../dist/target-model/types/snapshot.js";
import { csharpTargetTypeComponents } from "../../../dist/target-model/types/components.js";
import { createCsharpMetadataBudget, maximumCsharpMetadataEntries, maximumCsharpMetadataDepth } from "../../../dist/target-model/metadata/immutable.js";
import { csharpSourceTypeParameter } from "../../../dist/target-model/names/type-parameters.js";
import { createCsharpTypeParameterEnvironment } from "../../../dist/policy/constraints/type-parameter-environment.js";
import { createStructuralObjectShapeTarget } from "../../../dist/policy/types/objects/object-shape-policy/construction.js";
import { substituteTargetTypeParameters } from "../../../dist/target-model/types/substitution.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../../dist/target-model/types/equality.js";
import { csharpObjectShapeContractKey } from "../../../dist/target-model/types/object-shape-identity.js";
import { csharpObjectShapesEqual } from "../../../dist/target-model/types/object-shape-equality.js";
import { csharpConstraintsRequireReference, csharpTypeParameterConstraintResolutionKey } from "../../../dist/target-model/types/generic-constraints.js";
import { resolveTypeParameter } from "../../../dist/policy/types/resolution/source-evidence.js";
import { csharpTypeParameterConstraintsEqual, resolveCsharpTypeParameterConstraints } from "../../../dist/policy/constraints/type-parameter-constraints.js";
import { csharpTargetNamedType } from "../../../dist/target-model/types/factories.js";
import { csharpDelegateTargetType, csharpTaskTargetType } from "../../../dist/target-model/types/carriers/delegates.js";
import { csharpListTargetType, csharpEnumerableTargetType } from "../../../dist/target-model/types/carriers/collections.js";
import { csharpStringTargetType, csharpExceptionTargetType, csharpRuntimeErrorTargetType,
  csharpObjectTargetType, csharpVoidTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { projectDefinitionTargetType } from "../../../dist/policy/types/project/project-types.js";

const integer = Object.freeze({ kind: "source-primitive", name: "int32" });
const parameter = (identity, name = identity) => ({ kind: "type-parameter", identity, name });
const resolved = constraints => ({ kind: "resolved", constraints });
const container = element => ({ kind: "target-named", csharpAllowsRefLikeTypeArguments: [false], id: "Container", typeArguments: [element],
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

test("selected transitive class evidence is finite without guessing through unproved cycles", () => {
  const first = parameter("first");
  const second = parameter("second");
  first.csharpConstraints = resolved([typeConstraint(second)]);
  second.csharpConstraints = resolved([typeConstraint(first)]);
  assert.equal(csharpConstraintsRequireReference(first.csharpConstraints.constraints), false,
    "an actual cyclic dependency is not positive native class evidence");
  second.csharpConstraints = resolved([typeConstraint(first), { kind: "keyword", keyword: "class" }]);
  assert.equal(csharpConstraintsRequireReference(first.csharpConstraints.constraints), true,
    "a real terminal class requirement proves reference storage without reopening a declaration");
  const selected = parameter("selected");
  selected.csharpConstraints = resolved([{ kind: "type", type: { kind: "target-named", id: "LooksLikeClass",
    csharpAllowsRefLikeTypeArguments: [], csharpSourceDeclarationKind: "interface" } }]);
  assert.equal(csharpConstraintsRequireReference(selected.csharpConstraints.constraints), false,
    "the selected native kind wins over a class-looking name");
});

test("native constraint equivalence stays separate from direct and transitive reference evidence", () => {
  const unproved = csharpTargetNamedType("fixture.Base", undefined, undefined,
    { allowsRefLikeTypeArguments: [], sourceDeclarationKind: "class" });
  const proved = csharpTargetNamedType("fixture.Base", undefined, undefined,
    { allowsRefLikeTypeArguments: [], sourceDeclarationKind: "class", constraintRequiresReferenceType: true });
  const original = resolved([typeConstraint(unproved)]);
  const selected = resolved([typeConstraint(proved)]);
  assert.equal(targetTypeRefEquals(unproved, proved), true, "native type identity does not depend on a view's amount of proof");
  assert.equal(csharpTypeParameterConstraintsEqual(original.constraints, selected.constraints), true,
    "equivalent actual native clauses cannot require a gratuitous adapter");
  assert.equal(csharpConstraintsRequireReference(original.constraints), false, "a class-kind stamp alone proves no native reference constraint");
  assert.equal(csharpConstraintsRequireReference(selected.constraints), true, "the one selected positive fact establishes the native bound");
  assert.equal(csharpTypeParameterConstraintResolutionKey(original) === JSON.stringify([["type", targetTypeRefKey(unproved)]]), true,
    "absence of new positive evidence adds no irrelevant physical-owner fingerprint component");
  assert.equal(csharpTypeParameterConstraintResolutionKey(original) === csharpTypeParameterConstraintResolutionKey(selected), false,
    "materialization keys retain stronger actual selected proof without changing native identity");
  const indirectOriginal = resolved([typeConstraint({ ...parameter("dependent"), csharpConstraints: original })]);
  const indirectSelected = resolved([typeConstraint({ ...parameter("dependent"), csharpConstraints: selected })]);
  assert.equal(csharpTypeParameterConstraintResolutionKey(indirectOriginal) === csharpTypeParameterConstraintResolutionKey(indirectSelected), false,
    "a proof upgrade behind a real dependent binder is retained by the same evidence key");
  const snapshot = snapshotCsharpTargetTypes([{ ...parameter("selected"), csharpConstraints: selected }])[0];
  assert.equal(snapshot.csharpConstraints.constraints[0].type.csharpConstraintRequiresReferenceType === true, true,
    "immutable owner snapshots preserve the exact selected category proof");
  const substituted = substituteTargetTypeParameters({ ...parameter("selected"), csharpConstraints: selected }, new Map());
  assert.equal(substituted.csharpConstraints.constraints[0].type.csharpConstraintRequiresReferenceType === true, true,
    "native generic substitution never drops the selected positive proof");
});

test("known native reference factories publish proof without reclassifying object or interface bounds", () => {
  for (const [label, type] of [
    ["string", csharpStringTargetType()], ["exception", csharpExceptionTargetType()], ["runtime-error", csharpRuntimeErrorTargetType()],
    ["task", csharpTaskTargetType(csharpVoidTargetType())], ["generic-task", csharpTaskTargetType(integer)],
    ["action", csharpDelegateTargetType("System.Action", [])], ["function", csharpDelegateTargetType("System.Func", [integer], integer)],
    ["list", csharpListTargetType(integer)],
  ]) {
    assert.equal(type.csharpConstraintRequiresReferenceType === true, true, `${label}: the existing actual native producer retains its proof`);
    assert.equal(csharpConstraintsRequireReference([typeConstraint(type)]), true, `${label}: one canonical reader consumes the native fact`);
  }
  for (const [label, type] of [["object", csharpObjectTargetType()], ["interface", csharpEnumerableTargetType(integer)]]) {
    assert.equal(type.csharpConstraintRequiresReferenceType === undefined, true, `${label}: no native class-bound guarantee is invented`);
    assert.equal(csharpConstraintsRequireReference([typeConstraint(type)]), false, `${label}: ordinary reference values do not force reference-only arguments`);
  }
});

test("source emitted declaration kind alone owns its selected native reference guarantee", () => {
  for (const kind of ["class", "struct", "enum", "interface"]) {
    const selected = projectDefinitionTargetType({ kind, id: `fixture.${kind}`, sourceName: "Declared" }, []);
    assert.equal(selected.csharpConstraintRequiresReferenceType === true, kind === "class",
      `${kind}: the actual emitted source definition, not its name, selects the bound guarantee`);
    assert.equal(csharpConstraintsRequireReference([typeConstraint(selected)]), kind === "class",
      `${kind}: ordinary values and native interface implementers never gain an unproved class constraint`);
  }
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
  const shape = type => ({ targetType: { kind: "target-named", csharpAllowsRefLikeTypeArguments: [false], id: "tsonic.shape:same", typeArguments: [type] },
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
    assert.equal(isCsharpTargetTypeRef({ ...outer, csharpConstraints: malformed }), false,
      "the public carrier predicate independently rejects executable or malformed constraints");
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
  const sourceType = Object.freeze({});
  const symbol = Object.freeze({});
  const queries = { sourceFile, declarations: {
    typeSymbol: type => type === sourceType ? symbol : undefined,
    symbolDeclarations: selected => selected === symbol ? [declaration] : [],
  } };
  const selected = resolveTypeParameter(sourceType, queries, ast, environment);
  const repeated = resolveTypeParameter(sourceType, queries, ast, environment);
  assert.equal(selected.identity === outer.identity && repeated.identity === outer.identity, true,
    "ordinary source resolution retains the actual selected binder identity");
  assert.equal(selected.csharpConstraints === first && repeated.csharpConstraints === first, true,
    "ordinary source and structural owner reads consume the same immutable cached native contract");
  assert.equal(calls, 1, "source resolution does not create a second constraint parser or cache");
  assert.throws(() => resolveTypeParameter(sourceType, queries, ast), TypeError,
    "the superseded source resolver without its mandatory selected-constraint input is rejected");
  assert.equal(environment({ ...outer, identity: "wrong" }).kind, "unsupported", "identity mismatch fails closed");
  assert.equal(environment(parameter("missing")).kind, "unsupported", "no guessed unconstrained binder");
});

test("virtual generic declarations retain their checked consumer and do not cache missing-context failures", () => {
  const declarationFile = { path: "tsts-provider://owner.d.ts" };
  const consumerFile = { path: "/src/use.ts" };
  const declaration = { name: "Selected", position: 17 };
  const ast = {
    is: { IsTypeParameterDeclaration: node => node === declaration },
    name: node => node.name, text: name => name, getSourceFile: () => declarationFile, getPath: file => file.path,
    kind: () => 22, pos: node => node.position, end: node => node.position + 8,
  };
  const sourceType = Object.freeze({});
  const symbol = Object.freeze({});
  const queries = { sourceFile: consumerFile, declarations: {
    typeSymbol: type => type === sourceType ? symbol : undefined,
    symbolDeclarations: selected => selected === symbol ? [declaration] : [],
  } };
  const bound = typeConstraint(container(integer));
  const constraints = resolved([{ kind: "keyword", keyword: "class" }, bound]);
  let sourceQueries = 0;
  const environment = createCsharpTypeParameterEnvironment(ast, (node, selected, source) => {
    assert.equal(node === declaration, true, "virtual declaration identity is never normalized to another binder");
    if (source === undefined) return undefined;
    assert.equal(source.sourceFile === consumerFile, true, "the included checked consumer, not the virtual declaration file");
    assert.equal(source.sourceType === sourceType, true, "the selected checker type is retained without another declaration query");
    assert.equal(selected.csharpDeclaration === declaration, true, "the original declaration still identifies the native binder");
    sourceQueries += 1;
    return constraints;
  });
  const selected = csharpSourceTypeParameter(declaration, ast);
  assert.equal(environment(selected).kind, "unsupported", "missing request evidence is not a guessed empty native bound");
  const first = resolveTypeParameter(sourceType, queries, ast, environment);
  const second = resolveTypeParameter(sourceType, queries, ast, environment);
  assert.equal(first.csharpConstraints.kind, "resolved", "a later real consumer is not poisoned by the missing-context request");
  assert.equal(first.csharpConstraints.constraints.length, 2, "all actual keyword and selected interface constraints remain");
  assert.equal(first.csharpConstraints.constraints[1].type.typeArguments[0].name, "int32", "the selected native bound is unchanged");
  assert.equal(second.csharpConstraints === first.csharpConstraints, true, "one canonical immutable constraint result");
  assert.equal(environment(selected) === first.csharpConstraints, true, "later owner reads consume the same completed native evidence");
  assert.equal(sourceQueries, 1, "one checked producer query for this exact binder");
});

test("retained native clauses never depend on the virtual source declaration's token shape", () => {
  const retained = resolved([{ kind: "keyword", keyword: "unmanaged" }, typeConstraint(container(integer))]);
  const environment = createCsharpTypeParameterEnvironment({}, () => {
    assert.fail("already selected native constraints are not reparsed from source syntax");
  });
  assert.equal(environment({ ...parameter("native"), csharpConstraints: retained }) === retained, true,
    "unmanaged, value, class and interface evidence is authoritative before source-context resolution");
  const ast = { as: { AsTypeParameterDeclaration: () => undefined } };
  const unreadable = resolveCsharpTypeParameterConstraints({}, parameter("unknown"), {}, { ast, types: {} });
  assert.equal(unreadable.kind, "unsupported", "unreadable declaration metadata is not proof of an empty native constraint set");
  assert.equal(unreadable.reason, "The selected generic declaration has no readable source constraint evidence.");
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
  const available = createCsharpMetadataBudget();
  const snapshot = snapshotCsharpTargetTypes([parameter("outer")], available);
  assert.equal(snapshot[0].identity, "outer", "valid snapshot with adequate budget");
  assert.equal(Object.isFrozen(snapshot), true, "the accepted snapshot remains immutable");
  assert.equal(available.remaining() < maximumCsharpMetadataEntries, true, "the selected budget accounts for the snapshot");
  const budget = createCsharpMetadataBudget();
  for (const invalid of [NaN, Infinity, -1, 0.5]) {
    assert.throws(() => budget.reserve(invalid), TypeError);
    assert.throws(() => budget.reserve(1, invalid), TypeError);
  }
  assert.equal(budget.remaining(), maximumCsharpMetadataEntries, "invalid reservations leave the budget unchanged");
  budget.reserve(maximumCsharpMetadataEntries - 1);
  assert.equal(budget.remaining(), 1, "one reservation remains before the snapshot");
  assert.throws(() => snapshotCsharpTargetTypes([parameter("outer")], budget),
    { name: "TypeError", message: "C# immutable metadata requires bounded dense arrays." },
    "snapshots do not reset a selected traversal budget");
  assert.equal(budget.remaining(), 0, "the same budget reserved the root before rejecting its dense entries");
  assert.throws(() => budget.reserve(1), /finite resource budget/u, "the selected budget remains exhausted after rejection");
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
