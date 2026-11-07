// Generated owner binders and recursive union aliases (nextgen C-2542 §2, I6, R6). The deleted
// objects/shapes/union-definitions.ts built recursive structural unions from checker alias applications. Now:
//   - a recursive project union alias is represented once as a named `__TsonicUnion_<hash>` carrier whose type
//     arguments keep the authored binder order and whose arms keep the Host order (representation/declared.ts);
//   - a generated owner's binders are sealed through the per-view environment (createCsharpTypeParameterEnvironment)
//     when the shape target is created (createStructuralObjectShapeTarget / closeCsharpOwnerTypeParameterEnvironment).
import assert from "node:assert/strict";
import test from "node:test";
import { createCsharpTypeParameterEnvironment, isCsharpRefusal } from "../../../dist/representation/index.js";
import { CsharpMetadataResourceLimitFailure } from "../../../dist/target-model/metadata/immutable.js";
import { TargetCompilerResourceLimitFailure } from "@tsonic/target-api/artifacts";
import { csharpMetadataResourceFailure } from "../../../dist/backend/compile.js";
import { createStructuralObjectShapeTarget } from "../../../dist/analysis/objects/shapes/construction.js";
import { getCsharpRuntimeUnionArms } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { csharpSourceUnionIdentity } from "../../../dist/target-model/types/source-union-definitions.js";
import { csharpSourceTypeParameter } from "../../../dist/source/extension/type-parameters.js";
import { renderObjectShapeTypeParameters } from "../../../dist/backend/planner/objects/type-parameters.js";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { analyzeCsharpObjectShapeEmission } from "../../../dist/analysis/objects/declaration-emission.js";
import { objectShapeArtifactKey } from "../../../dist/target-model/records/objects/object-shape-keys.js";
import { hostProgram, representationServices, representations } from "../../representation/host-fixture.mjs";

// The object-shape emission analysis selects a generated owner's native binders (refusing unclosed constraints);
// the planner renders the selected binders.
function renderOwner(shape, diagnostics) {
  const artifact = { key: objectShapeArtifactKey(shape), fact: shape, capabilities: [], materialization: "synthetic", typeParameterNames: [] };
  const analysis = analyzeCsharpObjectShapeEmission({ ast: { is: { IsObjectLiteralExpression: () => false } }, nodes: [],
    nativeDemand: { entries: [] }, bindings: { bindingPatternProjection: { get: () => undefined } },
    demand: { artifacts: [artifact], get: key => key === artifact.key ? artifact : undefined },
    shapes: { knownShapes: () => [] }, names: { typeParameterNames: [], reservedNames: [] } });
  diagnostics.push(...analysis.issues);
  return analysis.issues.length !== 0 ? undefined : renderObjectShapeTypeParameters(undefined, shape, analysis.records, undefined);
}

const parameter = (identity, name = identity) => ({ kind: "type-parameter", identity, name });
const resolved = constraints => ({ kind: "resolved", constraints });
const integer = { kind: "source-primitive", name: "uint8" };
const member = (name, type) => ({ sourceKey: { kind: "property", name }, sourceName: name, targetName: name, memberKind: "property", type });

/** A generated shape over `types` (one property each), its owner binders sealed by `environment`. */
function generatedShape(types, environment) {
  const members = types.map((type, index) => member(`value${index}`, type));
  const targetType = createStructuralObjectShapeTarget(members, undefined, createCsharpTypeParameterEnvironment(environment));
  return { targetType, members };
}

function metadataResourceLimit(failure, dimension, limit) {
  const resource = csharpMetadataResourceFailure(failure);
  return failure instanceof CsharpMetadataResourceLimitFailure && failure.dimension === dimension && failure.limit === limit &&
    resource instanceof TargetCompilerResourceLimitFailure && resource.diagnostic.code === "TSONIC_COMPILER_RESOURCE_LIMIT" &&
    resource.diagnostic.evidence?.[0] === `${dimension}=${limit}`;
}

test("a recursive generic union alias is one named union carrier with authored binder order and Host arm order", () => {
  const program = hostProgram(`
type Tree<Later, Earlier> = { readonly left: Later; readonly next: Tree<Later, Earlier> | undefined } | { readonly right: Earlier };
export function walk<Later, Earlier>(value: Tree<Later, Earlier>): Tree<Later, Earlier> { return value; }
`);
  const services = representationServices(program);
  const walk = program.named("walk");
  const carrier = representations(services).slot(program.ast.parameters(walk)[0]);
  assert.equal(isCsharpRefusal(carrier) || carrier.kind === "refused", false, "the recursive alias is representable");
  const union = carrier.kind === "target-named" ? carrier : undefined;
  assert.notEqual(csharpSourceUnionIdentity(union), undefined, "a named __TsonicUnion_ carrier closes the cycle");
  const binders = program.ast.typeParameters(walk).map(declaration => csharpSourceTypeParameter(declaration, program.ast,
    program.facts.navigation.identity).identity);
  assert.deepEqual(union.typeArguments.map(argument => argument.identity), binders,
    "carrier arguments keep the authored binder positions; they are not sorted");
  const arms = getCsharpRuntimeUnionArms(union, services.typeDefinitions);
  assert.equal(arms?.length, 2, "one union with the two Host arms, registered once");
  const sum = program.sum(program.slot(program.ast.parameters(walk)[0]).definition ?? program.slot(program.ast.parameters(walk)[0]));
  assert.equal(sum.arms.length, 2, "the Host sum has the same two arms");
});

test("generated owner binders are sealed with exact identity, declaration and frozen constraints", () => {
  const binder = parameter("value", "Value");
  const declaration = {};
  binder.csharpDeclaration = declaration;
  const constraints = [{ kind: "keyword", keyword: "struct" }];
  const shape = generatedShape([binder], () => resolved(constraints));
  const argument = shape.targetType.typeArguments[0];
  assert.equal(argument.identity, binder.identity, "exact source binder identity");
  assert.equal(argument.csharpDeclaration === declaration, true, "opaque source declaration retained");
  assert.equal(Object.isFrozen(argument.csharpConstraints), true, "sealed native evidence");
  const diagnostics = [];
  assert.deepEqual(renderOwner(shape, diagnostics), [{ name: "Value", constraints: [{ kind: "KeywordConstraint", keyword: "struct" }] }]);
  assert.deepEqual(diagnostics, []);
  constraints.length = 0;
  assert.equal(shape.targetType.typeArguments[0].csharpConstraints.constraints.length, 1, "later mutation cannot reach the seal");
  assert.equal(binder.csharpConstraints === undefined, true, "source input not mutated");
});

test("a concrete member needs no binder resolution and keeps its exact carrier", () => {
  const shape = generatedShape([integer], () => { throw new Error("A concrete native carrier has no generic constraints."); });
  assert.equal((shape.targetType.typeArguments ?? []).length, 0);
  assert.equal(shape.members[0].type === integer, true, "exact concrete source carrier");
});

test("unavailable or unsupported owner constraints never become unconstrained emission", () => {
  for (const resolution of [
    { kind: "unsupported", reason: "Exact source declaration evidence is absent." },
    { kind: "unsupported", reason: "Selected native constraint is unsupported." },
  ]) {
    const shape = generatedShape([parameter("value", "Value")], () => resolution);
    const diagnostics = [];
    assert.equal(renderOwner(shape, diagnostics) === undefined, true);
    assert.equal(diagnostics.length, 1, "one bounded native owner diagnostic");
    assert.equal(diagnostics[0].message, resolution.reason, "no guessed unconstrained binder");
  }
});

test("owner closure rejects contradictory and executable metadata before a target is published", () => {
  const left = { ...parameter("same"), csharpConstraints: resolved([{ kind: "keyword", keyword: "class" }]) };
  const right = { ...left, csharpConstraints: resolved([{ kind: "keyword", keyword: "struct" }]) };
  assert.throws(() => generatedShape([left, right], selected => selected.csharpConstraints), /conflicting constraint evidence/u);
  let reads = 0;
  assert.throws(() => generatedShape([parameter("value")], () => ({ kind: "resolved", get constraints() { reads += 1; return []; } })),
    TypeError);
  assert.equal(reads, 0, "constraint getters never run");
});

test("owner binder traversal keeps the finite metadata depth bound", () => {
  let excessive = parameter("value");
  for (let depth = 0; depth < 130; depth += 1) excessive = { kind: "array", element: excessive };
  assert.throws(() => generatedShape([excessive], () => resolved([])), failure => metadataResourceLimit(failure, "depth", 128));
});

for (const surface of [undefined, "js"]) {
  test(`recursive generic owner constraints execute without losing identity in ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const sourceText = `
interface Payload { readonly amount: number; }
class Reading implements Payload { amount: number = 3; }
type Step<Value extends Payload> = { readonly kind: "done"; readonly value: Value }
  | { readonly kind: "read"; readonly resume: () => Step<Value> };
function done<Value extends Payload>(value: Value): Step<Value> { return { kind: "done", value }; }
function delayed<Value extends Payload>(value: Value): Step<Value> { return { kind: "read", resume: () => done(value) }; }
function complete<Value extends Payload>(step: Step<Value>): Value {
  if (step.kind === "done") return step.value;
  return complete(step.resume());
}
export function run(): boolean {
  const value = new Reading();
  return complete(delayed(value)) === value && complete(delayed(value)).amount === 3;
}`;
    executeCsharpConstruction(compileCsharpSource({ surface, sourceText }), `recursive-constrained-${surface ?? "native"}`);
  });
}
