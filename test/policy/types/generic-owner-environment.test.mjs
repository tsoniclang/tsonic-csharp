import assert from "node:assert/strict";
import test from "node:test";
import { CsharpMetadataResourceLimitFailure } from "../../../dist/target-model/metadata/immutable.js";
import { TargetCompilerResourceLimitFailure } from "@tsonic/target-api/artifacts";
import { csharpMetadataResourceFailure } from "../../../dist/backend/compile.js";
import { closeCsharpOwnerTypeParameterEnvironment, csharpObjectShapeTypeParameters } from "../../../dist/policy/types/objects/owner-type-parameters.js";
import { csharpFreeTypeParameterIdentities, visitCsharpTargetTypeParameters } from "../../../dist/target-model/types/generic-references.js";
import { isCsharpTargetTypeRef, snapshotCsharpTargetTypes } from "../../../dist/target-model/types/snapshot.js";
import { csharpTargetTypeComponents } from "../../../dist/target-model/types/components.js";
import { createCsharpMetadataBudget, maximumCsharpMetadataEntries, maximumCsharpMetadataDepth } from "../../../dist/target-model/metadata/immutable.js";
import { csharpSourceTypeParameter } from "../../../dist/source/extension/type-parameters.js";
import { createCsharpTypeParameterEnvironment, representTypeParameterConstraints } from "../../../dist/representation/index.js";
import { createStructuralObjectShapeTarget } from "../../../dist/analysis/objects/shapes/construction.js";
import { substituteTargetTypeParameters } from "../../../dist/policy/types/resolution/substitution.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../../dist/target-model/types/equality.js";
import { csharpObjectShapeContractKey } from "../../../dist/target-model/types/object-shape-identity.js";
import { csharpObjectShapesEqual } from "../../../dist/target-model/types/object-shape-equality.js";
import { csharpConstraintsRequireReference, csharpTypeParameterConstraintResolutionKey } from "../../../dist/target-model/types/generic-constraints.js";
import { csharpTypeParameterConstraintsEqual } from "../../../dist/policy/constraints/type-parameter-constraints.js";
import { hostProgram, representationServices, representations, represented } from "../../representation/host-fixture.mjs";
import { csharpTargetNamedType } from "../../../dist/target-model/types/factories.js";
import { csharpDelegateTargetType, csharpTaskTargetType } from "../../../dist/target-model/types/carriers/delegates.js";
import { csharpListTargetType, csharpEnumerableTargetType } from "../../../dist/target-model/types/carriers/collections.js";
import { csharpStringTargetType, csharpExceptionTargetType, csharpRuntimeErrorTargetType,
  csharpObjectTargetType, csharpVoidTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { projectDefinitionTargetType } from "../../../dist/policy/types/project/declaration-carriers.js";

const integer = Object.freeze({ kind: "source-primitive", name: "int32" });
const parameter = (identity, name = identity) => ({ kind: "type-parameter", identity, name });
const resolved = constraints => ({ kind: "resolved", constraints });
const container = element => ({ kind: "target-named", csharpAllowsRefLikeTypeArguments: [false], id: "Container", typeArguments: [element],
  csharpRender: { kind: "named", name: "Container" } });
const field = type => ({ sourceKey: { kind: "property", name: "value" }, sourceName: "value", targetName: "value", memberKind: "property", type });
const typeConstraint = type => ({ kind: "type", type });

function metadataResourceLimit(failure, dimension, limit) {
  const resource = csharpMetadataResourceFailure(failure);
  return failure instanceof CsharpMetadataResourceLimitFailure && failure.dimension === dimension && failure.limit === limit &&
    resource instanceof TargetCompilerResourceLimitFailure && resource.diagnostic.code === "TSONIC_COMPILER_RESOURCE_LIMIT" &&
    resource.diagnostic.evidence?.[0] === `${dimension}=${limit}`;
}

test("nongeneric owners do not allocate or query a generic constraint environment", () => {
  const environment = createCsharpTypeParameterEnvironment(() => { throw new Error("Nongeneric owners have no generic constraint query."); });
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
  assert.equal(csharpConstraintsRequireReference(first.csharpConstraints.constraints), false,
    "a class keyword reached through another binder permits a native value-type argument");
  assert.equal(csharpConstraintsRequireReference(second.csharpConstraints.constraints), true,
    "a direct class keyword still proves reference storage for its own binder");
  second.csharpConstraints = resolved([typeConstraint(csharpTargetNamedType("fixture.NativeBase", undefined, undefined,
    { allowsRefLikeTypeArguments: [], sourceDeclarationKind: "class", constraintRequiresReferenceType: true }))]);
  assert.equal(csharpConstraintsRequireReference(first.csharpConstraints.constraints), true,
    "a transitive concrete native base remains positive reference evidence");
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
  const environment = createCsharpTypeParameterEnvironment(selected => {
    calls.push(selected.identity);
    return resolved(selected.identity === outer.identity ? [typeConstraint(container(payload))] : []);
  });
  const owner = createStructuralObjectShapeTarget([field(outer)], undefined, environment);
  assert.deepEqual(owner.typeArguments.map(type => type.identity), ["outer", "payload"]);
  assert.equal(owner.typeArguments[0].csharpConstraints.constraints[0].type.typeArguments[0].identity, payload.identity);
  assert.equal(Object.isFrozen(owner.typeArguments), true, "immutable owner argument environment");
  assert.equal(Object.isFrozen(owner.typeArguments[0].csharpConstraints.constraints[0].type.typeArguments), true);
  assert.equal(calls.includes(payload.identity), true, "constraint dependency classified at the producer");
  const different = createStructuralObjectShapeTarget([field(outer)], undefined, createCsharpTypeParameterEnvironment(() => resolved([])));
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
  const selected = closeCsharpOwnerTypeParameterEnvironment([outer], createCsharpTypeParameterEnvironment(parameter => facts.get(parameter.identity)));
  assert.deepEqual(selected.map(parameter => parameter.identity), ["leaf", "left", "outer", "right"]);
  assert.equal(selected.every(parameter => Object.isFrozen(parameter.csharpConstraints)), true, "one finalized environment");
});

test("carrier identity remains binder identity while contradictory native owner evidence rejects", () => {
  const outer = parameter("outer", "Outer");
  const left = { ...outer, csharpConstraints: resolved([{ kind: "keyword", keyword: "class" }]) };
  const right = { ...outer, csharpConstraints: resolved([{ kind: "keyword", keyword: "struct" }]) };
  assert.equal(targetTypeRefEquals(left, right), true, "same exact native binder");
  assert.equal(targetTypeRefKey(left), targetTypeRefKey(right), "no replacement carrier identity");
  assert.throws(() => closeCsharpOwnerTypeParameterEnvironment([left, right], createCsharpTypeParameterEnvironment(parameter => parameter.csharpConstraints)),
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
    assert.throws(() => closeCsharpOwnerTypeParameterEnvironment([outer], createCsharpTypeParameterEnvironment(() => malformed)), TypeError);
  }
  assert.equal(reads, 0, "constraint getters never execute");
  assert.throws(() => snapshotCsharpTargetTypes([{ ...outer, csharpDeclaration: null }]), TypeError);
});

// Source binders (nextgen C-2542): a binder is identified by its declaration (csharpSourceTypeParameter) and its C#
// constraints are the represented Host descriptors of its authored constraint parts (representTypeParameterConstraints,
// one cached environment per program view: services.typeParameters). The checker route (resolveTypeParameter over a
// checked Type and its Symbol declarations) is deleted.
function constrainedProgram(files) {
  const program = hostProgram(`import type { int32 } from "@tsonic/core/types.js";
export interface Container<T> { value: T }
export function identity<Outer extends Container<int32>>(value: Outer): Outer { return value; }
`, files === undefined ? {} : { files });
  const declaration = program.nodes.find(node => program.ast.is.IsTypeParameterDeclaration(node) &&
    program.ast.text(program.ast.name(node)) === "Outer");
  const constraint = program.ast.as.AsTypeParameterDeclaration(declaration).Constraint;
  let queries = 0;
  const facts = Object.freeze({ ...program.facts, values: Object.freeze({ ...program.facts.values, type: node => {
    if (node === constraint) queries += 1;
    return program.facts.values.type(node);
  } }) });
  const services = representationServices(program, { facts });
  return { program, declaration, constraint, services, queries: () => queries };
}

test("source constraint resolution uses exact declaration identity once and seals native results", () => {
  const { program, declaration, services, queries } = constrainedProgram();
  const outer = csharpSourceTypeParameter(declaration, program.ast);
  assert.equal(outer.csharpDeclaration === declaration, true, "the binder carries its declaration");
  const first = services.typeParameters.resolve(outer).csharpConstraints;
  assert.equal(first.kind, "resolved");
  const bound = first.constraints.find(constraint => constraint.kind === "type");
  assert.equal(bound?.type.id === "global::Fixture.Container" && bound.type.typeArguments[0].name === "int32", true,
    "the authored Container<int32> constraint is the represented Host descriptor");
  assert.equal(services.typeParameters.resolve({ ...outer }).csharpConstraints === first, true, "one cached native constraint contract");
  assert.equal(Object.isFrozen(first) && Object.isFrozen(first.constraints), true, "immutable native constraint snapshot");
  const parameterSlot = program.ast.parameters(program.named("identity"))[0];
  const slot = represented(representations(services).slot(parameterSlot));
  assert.equal(slot.kind === "type-parameter" && slot.identity === outer.identity, true, "the slot is the declared binder itself");
  assert.equal(slot.csharpConstraints === first, true, "slot representation and owner reads consume the same immutable contract");
  assert.equal(queries(), 1, "one Host query of the authored constraint; no second parser or cache");
  assert.equal(services.typeParameters.resolve({ ...outer, identity: "wrong" }).csharpConstraints.kind, "unsupported",
    "identity mismatch with the declaration fails closed");
  assert.equal(services.typeParameters.resolve(parameter("missing")).csharpConstraints.kind, "unsupported", "no guessed unconstrained binder");
});

test("a binder declared in another file takes its constraints from its own authored constraint, not from a consumer", () => {
  const program = hostProgram(`import { pick } from "./records.js"; export const chosen = pick({ value: 1 });`, {
    files: { "records.ts": `import type { int32 } from "@tsonic/core/types.js";
export interface Container<T> { value: T }
export function pick<Selected extends Container<int32>>(value: Selected): Selected { return value; }
` } });
  const declaration = program.nodes.find(node => program.ast.is.IsTypeParameterDeclaration(node) &&
    program.ast.text(program.ast.name(node)) === "Selected");
  const services = representationServices(program);
  const selected = csharpSourceTypeParameter(declaration, program.ast);
  const first = services.typeParameters.resolve(selected).csharpConstraints;
  assert.equal(first.kind, "resolved", "the declaration's own constraint is complete without a consumer context");
  assert.equal(first.constraints.some(constraint => constraint.kind === "type" &&
    constraint.type.id === "global::Fixture.Container" && constraint.type.typeArguments[0].name === "int32"), true,
  "the selected native bound is the represented authored constraint");
  assert.equal(services.typeParameters.resolve(selected).csharpConstraints === first, true, "one canonical immutable constraint result");
  const direct = representTypeParameterConstraints(declaration, selected, services);
  assert.deepEqual(direct, first, "the cached environment and the direct mapping agree");
});

test("retained native clauses never depend on the source declaration's token shape", () => {
  const retained = createCsharpTypeParameterEnvironment(() => resolved([
    { kind: "keyword", keyword: "unmanaged" }, typeConstraint(container(integer)),
  ])).resolve(parameter("native")).csharpConstraints;
  const { services } = constrainedProgram();
  assert.equal(services.typeParameters.resolve({ ...parameter("native"), csharpConstraints: retained }).csharpConstraints === retained, true,
    "unmanaged, value, class and interface evidence is authoritative before source-declaration resolution");
  const unreadable = representTypeParameterConstraints({}, parameter("unknown"),
    { syntax: { as: { AsTypeParameterDeclaration: () => undefined } } });
  assert.equal(unreadable.kind, "unsupported", "unreadable declaration metadata is not proof of an empty native constraint set");
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
    failure => metadataResourceLimit(failure, "entries", maximumCsharpMetadataEntries),
    "snapshots do not reset a selected traversal budget");
  assert.equal(budget.remaining(), 0, "the same budget reserved the root before rejecting its dense entries");
  assert.throws(() => budget.reserve(1), failure => metadataResourceLimit(failure, "entries", maximumCsharpMetadataEntries), "the selected budget remains exhausted after rejection");
  const excessive = new Array(maximumCsharpMetadataEntries + 1);
  assert.throws(() => csharpFreeTypeParameterIdentities(excessive), failure => metadataResourceLimit(failure, "entries", maximumCsharpMetadataEntries), "reject before pending allocation");
  assert.throws(() => closeCsharpOwnerTypeParameterEnvironment(excessive, createCsharpTypeParameterEnvironment(() => resolved([]))), failure => metadataResourceLimit(failure, "entries", maximumCsharpMetadataEntries));
  assert.throws(() => csharpTargetTypeComponents({ kind: "tuple", elements: excessive }), failure => metadataResourceLimit(failure, "entries", maximumCsharpMetadataEntries));
  let nested = parameter("outer");
  for (let depth = 0; depth <= maximumCsharpMetadataDepth; depth += 1) nested = { kind: "array", element: nested };
  assert.throws(() => visitCsharpTargetTypeParameters(nested, () => {}), failure => metadataResourceLimit(failure, "depth", maximumCsharpMetadataDepth), "physical walk depth guard");
  assert.throws(() => csharpFreeTypeParameterIdentities([nested]), failure => metadataResourceLimit(failure, "depth", maximumCsharpMetadataDepth), "scoped free walk depth guard");
  const cyclic = { kind: "array" };
  cyclic.element = cyclic;
  const parameters = [];
  visitCsharpTargetTypeParameters(cyclic, parameter => parameters.push(parameter.identity));
  assert.deepEqual(parameters, [], "a repeated physical carrier terminates without repeated work");
  assert.deepEqual([...csharpFreeTypeParameterIdentities([cyclic])], [], "scoped cycles terminate");
  assert.throws(() => snapshotCsharpTargetTypes([cyclic]), /cycle/u, "cyclic native metadata is never published");
});
