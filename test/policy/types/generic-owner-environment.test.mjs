import assert from "node:assert/strict";
import test from "node:test";
import { CsharpMetadataResourceLimitFailure } from "../../../dist/target-model/metadata/immutable.js";
import { TargetCompilerResourceLimitFailure } from "@tsonic/target-api/artifacts";
import { csharpMetadataResourceFailure } from "../../../dist/backend/compile.js";
import { closeCsharpOwnerTypeParameterEnvironment, csharpObjectShapeTypeParameters } from "../../../dist/policy/types/callables/owner-environment.js";
import { csharpFreeTypeParameterIdentities, visitCsharpTargetTypeParameters } from "../../../dist/target-model/types/generic-references.js";
import { isCsharpTargetTypeRef, snapshotCsharpTargetTypes } from "../../../dist/target-model/types/snapshot.js";
import { csharpTargetTypeComponents } from "../../../dist/target-model/types/components.js";
import { createCsharpMetadataBudget, maximumCsharpMetadataEntries, maximumCsharpMetadataDepth } from "../../../dist/target-model/metadata/immutable.js";
import { csharpSourceTypeParameter } from "../../../dist/source/extension/type-parameters.js";
import { createCsharpTypeParameterEnvironment } from "../../../dist/policy/types/callables/parameter-environment.js";
import { checkCsharpSource, assertCsharpCheckingSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { createStructuralObjectShapeTarget } from "../../../dist/analysis/objects/shapes/construction.js";
import { substituteTargetTypeParameters } from "../../../dist/target-model/types/substitution.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../../dist/target-model/types/equality.js";
import { csharpObjectShapeContractKey } from "../../../dist/target-model/types/object-shape-identity.js";
import { csharpObjectShapesEqual } from "../../../dist/target-model/types/object-shape-equality.js";
import { csharpConstraintsRequireReference, csharpTypeParameterConstraintResolutionKey } from "../../../dist/target-model/types/generic-constraints.js";
import { csharpTypeParameterConstraintsEqual } from "../../../dist/policy/constraints/type-parameter-constraints.js";
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

test("source constraint resolution uses exact declaration identity once and seals native results", () => {
  const checked = checkCsharpSource({ sourceText: "export function select<Outer>(value: Outer): Outer { return value; }" });
  assertCsharpCheckingSucceeded(checked);
  const source = checked.source;
  const file = source.sourceFiles.find(file => source.ast.getPath(file) === "/project/index.ts");
  assert.equal(file !== undefined, true, "the actual checked consumer is retained");
  const owner = source.ast.statements(file).find(node => source.ast.is.IsFunctionDeclaration(node));
  assert.equal(owner !== undefined, true);
  const declarations = source.ast.typeParameters(owner);
  assert.equal(declarations.length, 1, "the complete original generic binder domain");
  const declaration = declarations[0];
  const slot = source.facts.values.declaredSlot(source.ast.parameters(owner)[0]);
  assert.equal(slot.kind, "resolved", "the actual original formal publishes its registered parameter evidence");
  source.facts.descriptors.assertEvidence(slot.value.type);
  assert.equal(slot.value.type.type.kind === "parameter" && slot.value.type.type.declaration === declaration, true);
  const outer = csharpSourceTypeParameter(declaration, source.ast);
  assert.equal(outer !== undefined, true);
  const evidence = { sourceFile: file, sourceType: slot.value.type };
  const input = resolved([typeConstraint(container(integer))]);
  let calls = 0;
  const environment = createCsharpTypeParameterEnvironment((selected, context) => {
    if (selected.identity !== outer.identity || selected.csharpDeclaration !== declaration || context === undefined) return undefined;
    assert.equal(context.sourceFile === file && context.sourceType === slot.value.type, true,
      "the exact immutable Source evidence and its original consumer accompany Native constraint admission");
    calls += 1;
    return input;
  });
  const first = environment.resolve(outer, evidence);
  input.constraints[0].type.typeArguments[0] = parameter("wrong");
  const repeated = environment.resolve({ ...outer }, evidence);
  assert.equal(repeated.csharpConstraints === first.csharpConstraints, true, "one cached immutable Native constraint contract");
  assert.equal(first.csharpConstraints.constraints[0].type.typeArguments[0].name, "int32", "immutable Native constraint snapshot");
  assert.equal(first.identity === outer.identity && repeated.identity === outer.identity, true,
    "registered Source and structural owner reads preserve the actual selected binder identity");
  assert.equal(environment.resolve(outer).csharpConstraints === first.csharpConstraints, true,
    "later Native owner reads consume the same completed evidence without another Source parser");
  assert.equal(calls, 1, "one exact Native producer query");
  assert.equal(environment.resolve({ ...outer, identity: "wrong" }, evidence).csharpConstraints.kind, "unsupported", "identity mismatch fails closed");
  assert.equal(environment.resolve(parameter("missing"), evidence).csharpConstraints.kind, "unsupported", "no guessed unconstrained binder");
});

test("type parameter declarations and published descriptors share one declaration-owned constraint resolution", () => {
  for (const descriptorFirst of [false, true]) {
    const checked = checkCsharpSource({ sourceText: `
      interface Box<Value> { value: Value; items: Value[]; }
      type Selected<Value> = Value extends number ? number : string;
      type Recursive = number | readonly Recursive[];
      function outer<Outer>() { class Local<Inner> {} return Local; }
    ` });
    assertCsharpCheckingSucceeded(checked);
    const source = checked.source;
    const file = source.sourceFiles.find(file => source.ast.getPath(file) === "/project/index.ts");
    assert.equal(file !== undefined, true);
    const box = source.ast.statements(file).find(node => source.ast.is.IsInterfaceDeclaration(node));
    assert.equal(box !== undefined, true, "the original Box declaration is retained");
    const parameters = source.ast.typeParameters(box);
    assert.equal(parameters.length, 1, "the complete original Box binder domain");
    const declaration = parameters[0];
    const slot = source.facts.values.declaredSlot(box);
    assert.equal(slot.kind, "resolved", "the actual declared template registers its original Source binder");
    source.facts.descriptors.assertEvidence(slot.value.type);
    const descriptor = source.facts.descriptors.typeParameter(declaration);
    assert.equal(descriptor.declaration === declaration && descriptor.owner === box, true,
      "the canonical Source descriptor retains the identical original declaration and owner");
    let resolutions = 0;
    const environment = createCsharpTypeParameterEnvironment((parameter, context) => {
      assert.equal(parameter.csharpDeclaration === declaration, true, "the original declaration owns this Native constraint fixture");
      assert.equal(context === undefined, true, "neither Native entry requires occurrence-specific checker evidence");
      resolutions += 1;
      return resolved([{ kind: "keyword", keyword: "class" }]);
    });
    const fromDescriptor = () => environment.resolve(csharpSourceTypeParameter(descriptor.declaration, source.ast));
    const fromNode = () => environment.resolve(csharpSourceTypeParameter(declaration, source.ast));
    const first = descriptorFirst ? fromDescriptor() : fromNode();
    const second = descriptorFirst ? fromNode() : fromDescriptor();
    assert.equal(first === second && first.csharpDeclaration === declaration, true,
      "both orders retain the identical immutable Native binder without a Source-solving adapter");
    assert.equal(first.csharpConstraints.kind === "resolved" && first.csharpConstraints.constraints.length === 1 &&
      first.csharpConstraints.constraints[0].keyword === "class", true, "the complete original Native constraint fixture is retained");
    assert.equal(resolutions, 1, "one Native declaration producer serves both original-identity consumers");
  }
});

test("virtual generic declarations retain their checked consumer and do not cache missing-context failures", () => {
  const checked = checkCsharpSource({ sourceText: `
    import { defaultof } from "@tsonic/core/lang.js";
    import type { int32 } from "@tsonic/core/types.js";
    export const selected = defaultof<int32>();
  ` });
  assertCsharpCheckingSucceeded(checked);
  const source = checked.source;
  const consumerFile = source.sourceFiles.find(file => source.ast.getPath(file) === "/project/index.ts");
  assert.equal(consumerFile !== undefined, true);
  const calls = source.facts.navigation.nodesForFiles([consumerFile]).filter(node => source.ast.is.IsCallExpression(node));
  assert.equal(calls.length, 1, "one unchanged original consumer application");
  const application = source.facts.applications.application(calls[0]);
  assert.equal(application.kind, "resolved", "the real provider signature is selected before Native admission");
  const signature = application.value.identity.signature;
  assert.equal(signature.typeParameters.length, 1, "the complete original provider generic domain");
  const declaration = signature.typeParameters[0];
  const declarationFile = source.ast.getSourceFile(declaration);
  assert.equal(declarationFile !== undefined && declarationFile !== consumerFile, true, "the original provider declaration is not the consumer");
  assert.match(source.ast.getPath(declarationFile), /^tsts-provider:/u, "the normal Host registered a genuine virtual provider declaration");
  const result = source.facts.descriptors.component(application.value.callee.value, { kind: "result", signature });
  assert.equal(result.kind, "resolved", "the exact registered signature child supplies the generic Source context");
  source.facts.descriptors.assertEvidence(result.value);
  const selected = csharpSourceTypeParameter(declaration, source.ast);
  assert.equal(selected !== undefined, true);
  const evidence = { sourceFile: consumerFile, sourceType: result.value };
  const constraints = resolved([{ kind: "keyword", keyword: "class" }, typeConstraint(container(integer))]);
  let sourceQueries = 0;
  const environment = createCsharpTypeParameterEnvironment((parameter, context) => {
    assert.equal(parameter.csharpDeclaration === declaration, true, "the virtual original is never normalized to another binder");
    if (context === undefined) return undefined;
    assert.equal(context.sourceFile === consumerFile && context.sourceType === result.value, true,
      "the original included consumer and authenticated registered child, not the virtual file or a checker Type");
    sourceQueries += 1;
    return constraints;
  });
  assert.equal(environment.resolve(selected).csharpConstraints.kind, "unsupported", "missing consumer context does not manufacture empty bounds");
  const first = environment.resolve(selected, evidence);
  const second = environment.resolve(selected, evidence);
  assert.equal(first.csharpConstraints.kind, "resolved", "the later actual context is not poisoned by the missing request");
  assert.equal(first.csharpConstraints.constraints.length, 2, "all keyword and selected interface constraints remain");
  assert.equal(first.csharpConstraints.constraints[1].type.typeArguments[0].name, "int32", "the selected Native bound is unchanged");
  assert.equal(second.csharpConstraints === first.csharpConstraints, true, "one canonical immutable Native contract");
  assert.equal(environment.resolve(selected).csharpConstraints === first.csharpConstraints, true, "subsequent owner reads reuse completed evidence");
  assert.equal(sourceQueries, 1, "one authenticated-context Native producer query");
});

test("retained native clauses never depend on the virtual source declaration's token shape", () => {
  const retained = createCsharpTypeParameterEnvironment(() => resolved([
    { kind: "keyword", keyword: "unmanaged" }, typeConstraint(container(integer)),
  ])).resolve(parameter("native")).csharpConstraints;
  const environment = createCsharpTypeParameterEnvironment(() => {
    assert.fail("already selected Native constraints are not reparsed from Source syntax");
  });
  const selected = environment.resolve({ ...parameter("native"), csharpConstraints: retained });
  assert.equal(csharpTypeParameterConstraintResolutionKey(selected.csharpConstraints),
    csharpTypeParameterConstraintResolutionKey(retained),
    "all exact unmanaged, value, class and interface clauses remain authoritative independently of Source token shape");
  assert.equal(selected.csharpConstraints.constraints.length, 2, "the complete expected retained Native domain");
  const unknown = createCsharpTypeParameterEnvironment(() => undefined).resolve(parameter("unknown"));
  assert.equal(unknown.csharpConstraints.kind, "unsupported", "unavailable constraint evidence is never an empty Native constraint set");
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
