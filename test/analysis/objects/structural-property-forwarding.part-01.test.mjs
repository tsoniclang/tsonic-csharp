import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { analyzeCsharpProjectCallableAdapters } from "../../../dist/analysis/project-types/callable-adapters.js";
import { selectCsharpStructuralInterfaceImplementation } from "../../../dist/policy/types/objects/structural-implementation.js";
import { csharpTargetNamedType } from "../../../dist/target-model/types/factories.js";
import { csharpVariantArgumentImplicitlyAccepts, namedTargetTypeImplicitlyAccepts } from "../../../dist/policy/conversions/carriers.js";
import { csharpNullableTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { csharpStringTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { unexpectedNativeDispatchRead, emptyNativeDispatch, integer, number, nativePolicy, propertyFixture, nativeVarianceFixture, covariantSource, covariantObserver, readonlySource, nativeObserver } from "./structural-property-forwarding.fixtures.mjs";

test("readonly native property admission publishes the single exact conversion and lookup-only evidence", () => {
  const value = propertyFixture();
  const finalizedResult = analyzeCsharpProjectCallableAdapters(value.policy, value.callables, value.shapes, value.declarations, value.projections, emptyNativeDispatch);
  assert.equal(finalizedResult.kind, "resolved", "structural properties preserve their native dispatch boundary");
  const finalized = finalizedResult.value;
  const implementations = finalized.objectShapes.structuralImplementations(value.sourceType);
  const property = implementations[0]?.properties[0];
  assert.equal(finalized.issues.length, 0, "native int32-to-number reads are admitted without changing their backing storage");
  assert.equal(property?.sourceType === integer && property.read.source === integer && property.read.target === number, true,
    "the actual source carrier and required destination read carrier are exact");
  assert.equal(property?.read.conversion.kind === "implicit" && property.read.conversion.proof === "numeric", true,
    "canonical native value admission owns the numeric conversion");
  assert.equal(implementations[0].sourceNode === value.sourceNode, true, "the original checked source identity survives publication");
  assert.equal(Object.isFrozen(implementations) && Object.isFrozen(property) && Object.isFrozen(property.read), true,
    "every published forwarding decision is immutable");
  assert.equal(Object.hasOwn(finalized.objectShapes, "issues"), false, "expected analysis issues are not a backend service");
  const completedReads = value.reads();
  value.policy.objectShapes.resolveTarget = () => assert.fail("a final property read cannot reopen conversion admission");
  value.shapes.structuralImplementations = () => assert.fail("a final property read cannot repeat logical selection");
  assert.equal(finalized.objectShapes.structuralImplementations(value.sourceType) === implementations, true,
    "the final reader preserves exact record identity");
  assert.equal(value.reads(), completedReads, "published reads perform no new native relation query");
});

test("readonly admission failures remain expected source issues and publish no failed native property", () => {
  const value = propertyFixture(csharpStringTargetType());
  const inherited = Object.freeze({ node: value.sourceNode, code: "CSHARP_UNSUPPORTED_AST",
    message: "An analyzed interface has no exact inherited native implementation." });
  value.shapes.issues = Object.freeze([inherited]);
  const finalizedResult = analyzeCsharpProjectCallableAdapters(value.policy, value.callables, value.shapes, value.declarations, value.projections, emptyNativeDispatch);
  assert.equal(finalizedResult.kind, "resolved", "structural properties preserve their native dispatch boundary");
  const finalized = finalizedResult.value;
  assert.equal(finalized.issues.length, 2, "all existing inherited and property admission failures are collected together");
  assert.equal(finalized.issues[0] === inherited, true, "the existing graph owner issue is not dropped or relabelled");
  assert.equal(finalized.issues[1]?.node === value.sourceNode && finalized.issues[1]?.code === "CSHARP_UNSUPPORTED_AST" &&
    finalized.issues[1]?.message === "An analyzed interface property has no exact native forwarding conversion.", true,
  "a reachable unsupported relation is rejected at its exact source before publication, not thrown as an internal invariant");
  assert.equal(finalized.objectShapes.structuralImplementations(value.sourceType)[0].properties.length, 0,
    "a failed native property has no partial selected conversion for the planner");
  assert.equal(Object.isFrozen(finalized.issues), true, "the program's pre-seal rejection input is immutable");
});

test("readonly property admission refuses unrenderable selected carriers without publishing a native member", () => {
  for (const target of [{ kind: "opaque", id: "unrenderable-property" },
    { kind: "target-named", id: "test.PropertyWithoutNativeRendering", csharpAllowsRefLikeTypeArguments: [] }]) {
    const value = propertyFixture(target);
    const finalizedResult = analyzeCsharpProjectCallableAdapters(value.policy, value.callables, value.shapes, value.declarations, value.projections, emptyNativeDispatch);
    assert.equal(finalizedResult.kind, "resolved", "structural properties preserve their native dispatch boundary");
    const finalized = finalizedResult.value;
    assert.equal(finalized.issues.length === 1 && finalized.issues[0].node === value.sourceNode &&
      finalized.issues[0].code === "CSHARP_UNSUPPORTED_AST" &&
      finalized.issues[0].message === "An analyzed interface property has no exact native forwarding type.", true,
    `${target.kind}: exact selected native rendering is proved before conversion publication`);
    assert.equal(finalized.objectShapes.structuralImplementations(value.sourceType)[0].properties.length, 0,
      `${target.kind}: no partial property or invented carrier reaches the planner`);
  }
});

test("writable structural properties require exact storage while readonly reads reach canonical admission", () => {
  const sourceNode = Object.freeze({});
  const targetType = (name, kind) => csharpTargetNamedType(`test.${name}`, undefined, { kind: "named", name },
    { sourceDeclarationKind: kind, allowsRefLikeTypeArguments: [] });
  const member = (type, readonly) => Object.freeze({ sourceKey: { kind: "property", name: "value" },
    sourceName: "value", targetName: "value", memberKind: "property", type, readonly });
  const read = member(integer, false);
  for (const [label, write, admitted] of [
    ["readonly widening", member(number, true), true],
    ["writable exact", member(integer, false), true],
    ["writable widening", member(number, false), false],
  ]) {
    const selected = selectCsharpStructuralInterfaceImplementation(nativePolicy, { sourceNode, declaredSupertypes: [],
      source: { targetType: targetType("Body", "class"), members: [read] },
      destination: { targetType: targetType("View", "interface"), members: [write] },
      members: [{ source: read, destination: write, openSource: read, openDestination: write }] });
    assert.equal(selected !== undefined, admitted, `${label}: the existing native storage rule`);
    if (selected !== undefined) assert.equal(selected.properties[0]?.sourceType === integer, true,
      `${label}: selected reads retain the original native storage width`);
  }
});

test("a supplied readonly generic destination is authoritative rather than unified with native field storage", () => {
  const parameter = Object.freeze({ kind: "type-parameter", identity: "view:T", name: "T" });
  const target = argument => csharpTargetNamedType("test.GenericView", [argument], { kind: "named", name: "GenericView" },
    { sourceDeclarationKind: "interface", allowsRefLikeTypeArguments: [false] });
  const read = Object.freeze({ sourceKey: { kind: "property", name: "value" }, sourceName: "value", targetName: "value",
    memberKind: "property", type: integer });
  const open = Object.freeze({ ...read, readonly: true, type: parameter });
  const write = Object.freeze({ ...open, type: number });
  const source = Object.freeze({ targetType: csharpTargetNamedType("test.NarrowBody", undefined, undefined,
    { sourceDeclarationKind: "class", allowsRefLikeTypeArguments: [] }), members: [read] });
  const destination = Object.freeze({ targetType: target(number), members: [write],
    declarationTemplate: Object.freeze({ targetType: target(parameter), members: [open] }) });
  const selected = selectCsharpStructuralInterfaceImplementation(nativePolicy, { sourceNode: {}, source, destination, declaredSupertypes: [],
    members: [{ source: read, destination: write, openSource: read, openDestination: open }] });
  assert.equal(selected !== undefined, true, "readonly native widening is not an owner-argument equality constraint");
  assert.equal(selected.interfaceType.typeArguments[0] === number && selected.properties[0].member.type === number, true,
    "the authored destination argument controls the physical interface and its selected read type");
  assert.equal(selected.properties[0].sourceType === integer, true, "original exact backing storage is not changed to satisfy inference");
});

test("generated native out evidence and the canonical reference relation govern every generic variance slot", () => {
  const value = nativeVarianceFixture();
  const string = csharpStringTargetType();
  const nullableString = csharpNullableTargetType(string);
  const unknown = Object.freeze({ kind: "type-parameter", identity: "owner:Unknown", name: "Unknown",
    csharpConstraints: Object.freeze({ kind: "resolved", constraints: Object.freeze([]) }) });
  for (const [label, source, target, admitted] of [
    ["reference covariance", value.derived, value.base, true],
    ["native reference absence", string, nullableString, true],
    ["opposite absence", nullableString, string, false],
    ["incompatible reference direction", value.base, value.derived, false],
    ["native value widening is not covariance", integer, number, false],
    ["unconstrained is not reference evidence", unknown, value.base, false],
    ["exact native value identity", integer, integer, true],
  ]) {
    assert.equal(csharpVariantArgumentImplicitlyAccepts(value.policy, source, target, new Set()), admitted,
      `${label}: the one canonical native argument relation`);
    assert.equal(namedTargetTypeImplicitlyAccepts(value.policy, value.target([source]), value.target([target]), new Set()), admitted,
      `${label}: generated interface construction uses its actual out declaration`);
  }
  const absent = { ...value.policy, objectShapes: { resolveNode: () => undefined, resolveTarget: () => undefined } };
  assert.equal(namedTargetTypeImplicitlyAccepts(absent, value.target([value.derived]), value.target([value.base]), new Set()), false,
    "a generated-looking identifier without selected native out evidence is not covariance");
  const invariant = { ...value.policy, objectShapes: { resolveNode: () => undefined, resolveTarget: type => ({
    targetType: type, members: value.template.members,
    declarationTemplate: { ...value.template, covariantTypeParameterIdentities: [] },
  }) } };
  assert.equal(namedTargetTypeImplicitlyAccepts(invariant, value.target([value.derived]), value.target([value.base]), new Set()), false,
    "an invariant or writable declaration gains no covariance from its argument types");
  assert.equal(namedTargetTypeImplicitlyAccepts(value.policy, value.target([value.derived]), value.target([value.base, value.base]), new Set()), false,
    "native generic arity is never repaired by variance");
  const nativeClass = type => csharpTargetNamedType("test.NativeInvariant", [type], { kind: "named", name: "NativeInvariant" },
    { sourceDeclarationKind: "class", allowsRefLikeTypeArguments: [false] });
  assert.equal(namedTargetTypeImplicitlyAccepts(value.policy, nativeClass(value.derived), nativeClass(value.base), new Set()), false,
    "ordinary native classes, including native task classes, remain invariant");
});

test("a native covariant readonly destination retains only its proved source-template relationship", () => {
  const value = nativeVarianceFixture();
  const parameter = Object.freeze({ kind: "type-parameter", identity: "box:Value", name: "Value" });
  const body = argument => csharpTargetNamedType("test.ReferenceBox", [argument], { kind: "named", name: "ReferenceBox" },
    { sourceDeclarationKind: "class", allowsRefLikeTypeArguments: [false] });
  const openRead = { ...value.member(parameter), readonly: false };
  const read = { ...openRead, type: value.derived };
  const write = value.member(value.base);
  const source = { targetType: body(value.derived), members: [read],
    declarationTemplate: { targetType: body(parameter), members: [openRead] } };
  const destination = { targetType: value.target([value.base]), members: [write], declarationTemplate: value.template };
  const evidence = { sourceNode: {}, source, destination, declaredSupertypes: [],
    members: [{ source: read, destination: write, openSource: openRead, openDestination: value.template.members[0] }] };
  const selected = selectCsharpStructuralInterfaceImplementation(value.policy, evidence);
  assert.equal(selected.interfaceType.typeArguments[0] === parameter && selected.properties[0].member.type === parameter, true,
    "Box<Derived> satisfies the supplied Read<Base> through native Read<out Value>, not a fixed Base edge on every Box<Value>");
  assert.equal(selected.properties[0].sourceType === parameter, true, "native backing storage remains the original source parameter");
  const invariant = selectCsharpStructuralInterfaceImplementation(value.policy, { ...evidence,
    destination: { ...destination, declarationTemplate: { ...value.template, covariantTypeParameterIdentities: [] } } });
  assert.equal(invariant.interfaceType.typeArguments[0] === value.base, true,
    "a destination without native out evidence retains its actual supplied closed argument");
});

for (const surface of Array.from(["native", "js"]).slice(0, 2)) {
test(`native readonly covariance preserves generic storage, identity and zero-allocation reads (${surface})`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: covariantSource });
    assert.equal(compiled.sourceDiagnosticsText, "", "the actual source generic relations are checked");
    assert.equal(compiled.result.diagnostics.length, 0,
      compiled.result.diagnostics.map(issue => `${issue.code}: ${issue.message}`).join(" | "));
    mkdirSync(new URL("../../../.temp/C19-structural-property-forwarding/", import.meta.url), { recursive: true });
    writeFileSync(new URL(`../../../.temp/C19-structural-property-forwarding/covariance-${surface}.json`, import.meta.url), JSON.stringify({ sourceText: covariantSource, nativeProgram: covariantObserver, artifacts: [...compiled.artifacts] }) + "\n");
    const output = executeCsharpConstruction(compiled, `C19-native-covariance-${surface}`, false, false, [], covariantObserver);
    assert.equal(output, "native covariance identity; generated=0; native=0", "the exact native reference/storage/allocation contract");
    let removed = 0;
    const invariant = new Map([...compiled.artifacts].map(([path, source]) => [path, path.endsWith(".cs")
      ? source.replace(/(<)out\s+/gu, (_match, prefix) => { removed += 1; return prefix; }) : source]));
    assert.equal(removed > 0, true, "the inverse removes actual generated native out evidence, never a fixture or metadata field");
    assert.throws(() => executeCsharpConstruction({ ...compiled, artifacts: invariant }, `C19-native-invariant-${surface}`,
      false, false, [], covariantObserver), error => /error CS(?:0029|0266)/u.test(String(error.message)),
    "native C# refuses the otherwise identical invariant interface conversion");
  });
}

for (const surface of Array.from(["native", "js"]).slice(0, 1)) {
test(`inherited readonly native property obligations do not become internal failures (${surface})`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: readonlySource });
    assert.equal(compiled.sourceDiagnosticsText, "", "every readonly/writable source relation is checked, not fabricated");
    assert.equal(compiled.result.diagnostics.length, 0,
      `native property admission: ${compiled.result.diagnostics.map(issue => `${issue.code}: ${issue.message}`).join(" | ")}`);
    const generated = [...compiled.artifacts.values()].join("\n");
    assert.equal(/public int value = 7;/u.test(generated), true, "the native int32 backing is never widened to the base read type");
    assert.equal(/double ReadBase\.value/u.test(generated), true, "the true inherited native numeric obligation is emitted");
    assert.equal(/DerivedValue\?? value/u.test(generated), true, "reference backing retains its concrete selected native carrier");
    assert.equal((generated.match(/double MethodNumber\.read\(/gu) ?? []).length, 2,
      "the direct body and inherited derived body each emit exactly one bridge at their own native class");
    assert.equal((generated.match(/BaseValue ReferenceMethod\.read\(/gu) ?? []).length, 1,
      "reference covariance has one canonical explicit implementation, not competing producers");
    assert.equal((generated.match(/ExactNative\.echo</gu) ?? []).length, 0,
      "an alpha-equivalent native generic method gains no gratuitous interface adapter");
    assert.equal((generated.match(/EqualBound\.read</gu) ?? []).length, 0,
      "equal alpha-aligned native generic bounds need no additional interface bridge");
    assert.equal((generated.match(/WeakerBound\.read</gu) ?? []).length, 1,
      "legal weaker body bounds require one explicit bridge rather than an invalid native implicit implementation");
    assert.equal((generated.match(/ClassBound\.read</gu) ?? []).length, 1,
      "a nominal class bound satisfies the body's class constraint without equating the native method declarations");
    assert.equal((generated.match(/DependentBound\.read</gu) ?? []).length, 0,
      "dependent native bounds preserve exact alpha-equivalent implicit implementation");
    const projectedMethod = /double ProjectedNumber\.read<([^>]+)>/u.exec(generated);
    assert.equal(projectedMethod !== null && projectedMethod[1].split(",").length === 3, true,
      "the existing exact-layout native optional method publishes its real binder plus both required projection binders");
    assert.equal(/override DerivedValue read\(/u.test(generated), true,
      "the original native class covariant-override path remains separate and unchanged");
    const captureRoot = new URL("../../../.temp/C19-structural-property-forwarding/", import.meta.url);
    mkdirSync(captureRoot, { recursive: true });
    writeFileSync(new URL(`${surface}.json`, captureRoot), JSON.stringify({ sourceText: readonlySource, nativeProgram: nativeObserver, artifacts: [...compiled.artifacts] }) + "\n");
    const output = executeCsharpConstruction(compiled, `C19-readonly-closure-${surface}`, false, false, [], nativeObserver);
    assert.equal(output, "readonly native-equivalent; generated=0; native=0",
      "complete native projects prove exact getter counts, identity, native absence, writable aliasing and zero extra allocation");
    let removed = 0;
    const omitted = new Map([...compiled.artifacts].map(([path, source]) => [path, source.replace(/this\.read<[^>]+>\(\)/gu, () => {
      removed += 1;
      return "this.read()";
    })]));
    assert.equal(removed >= 3, true, "the actual return-only generic bodies require selected invocation arguments");
    assert.throws(() => executeCsharpConstruction({ ...compiled, artifacts: omitted }, `C19-generic-arguments-omitted-${surface}`,
      false, false, [], nativeObserver), error => String(error.message).includes("CS0411"),
    "Roslyn rejects omitted real body type arguments; a source metadata/import error is not a valid native inverse");
    let removedBridge = 0;
    const invalidImplicit = new Map([...compiled.artifacts].map(([path, source]) => [path,
      source.replace(/\bint WeakerBound\.read<[^>]+>\(\)\s*\{[^{}]*\}/gu, () => { removedBridge += 1; return ""; })]));
    assert.equal(removedBridge, 1, "the countercontrol removes only the actual legal weaker-bound explicit bridge");
    assert.throws(() => executeCsharpConstruction({ ...compiled, artifacts: invalidImplicit }, `C19-weaker-bound-implicit-${surface}`,
      false, false, [], nativeObserver), error => String(error.message).includes("CS0425"),
    "Roslyn requires matching native implicit method bounds even when the explicit invocation is valid");
    let tightened = 0;
    const invalidInvocation = new Map([...compiled.artifacts].map(([path, source]) => [path,
      source.replace(/(class ConstrainedNumberBody\b[\s\S]*?where\s+Native\s*:\s*)BaseValue\b/u, (_match, prefix) => {
        tightened += 1;
        return `${prefix}DerivedValue`;
      })]));
    assert.equal(tightened, 1, "the native inverse tightens only the actual generic implementation's bound");
    assert.throws(() => executeCsharpConstruction({ ...compiled, artifacts: invalidInvocation }, `C19-stricter-bound-invocation-${surface}`,
      false, false, [], nativeObserver), error => String(error.message).includes("CS0311"),
    "Roslyn refuses a generic bridge whose destination binder cannot meet the implementation requirement");
  });

test(`phantom implementation bounds require real native invocation admission (${surface})`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `import type { int32 } from "@tsonic/core/types.js";
class Base { value: number = 1; }
class Derived extends Base { extra: number = 2; }
interface Read { read<T extends Base>(): number; }
class Body implements Read { read<Native extends Derived>(): int32 { return 7; } }
export function run(): number { const value: Read = new Body(); return value.read<Base>(); }` });
    assert.equal(compiled.sourceDiagnosticsText, "", "unused source binders are checker-admitted and still have real native constraints");
    assert.equal(compiled.result.diagnostics.some(issue => issue.code === "CSHARP_PROJECT_CALLABLE_ADAPTER_NOT_PROVEN" &&
      issue.message === "An interface method's native type arguments do not satisfy its implementation's generic constraints."), true,
    "the canonical owner refuses the exact impossible native invocation before sealing");
    assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined && compiled.artifacts.size === 0, true,
      "an unproved generic native invocation publishes no program, plan or artifact");
    assert.equal(compiled.result.diagnostics.some(issue => String(issue.code).includes("INTERNAL")), false,
      "a source-reachable native bound failure is not an internal invariant");
  });

test(`writable structural widening refuses before any native artifacts are published (${surface})`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `import type { int32 } from "@tsonic/core/types.js";
interface WritableView { value: number; }
class NarrowBody { value: int32 = 7; }
export function run(): number { const view: WritableView = new NarrowBody(); view.value = 1.5; return view.value; }` });
    assert.equal(compiled.sourceDiagnosticsText, "", "the TypeScript-accepted writable relation requires a real native storage decision");
    assert.equal(compiled.result.diagnostics.some(issue => issue.code === "CSHARP_UNSUPPORTED_AST" &&
      /^No exact C# implicit conversion relates /u.test(issue.message)), true,
    "the existing canonical conversion owner precisely refuses an unsound writable native relation");
    assert.equal(compiled.result.diagnostics.some(issue => String(issue.code).includes("INTERNAL")), false,
      "a reachable native limitation is never relabelled an internal invariant");
    assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined, true,
      "a rejected source never becomes a sealed program or planner input");
    assert.equal(compiled.artifacts.size, 0, "no source/native member is silently omitted from a partially published artifact");
  });

test(`supplied writable generic widening remains refused without published artifacts (${surface})`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `import type { int32 } from "@tsonic/core/types.js";
interface WritableView<T> { value: T; }
class NarrowBody { value: int32 = 7; }
export function run(): number { const view: WritableView<number> = new NarrowBody(); view.value = 1.5; return view.value; }` });
    assert.equal(compiled.sourceDiagnosticsText, "", "the native inverse is a checked writable generic relation");
    assert.equal(compiled.result.diagnostics.some(issue => issue.code === "CSHARP_UNSUPPORTED_AST" &&
      /^No exact C# implicit conversion relates /u.test(issue.message)), true, "canonical writable storage remains exact");
    assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined && compiled.artifacts.size === 0, true,
      "no failed writable native contract can reach publication");
    assert.equal(compiled.result.diagnostics.some(issue => String(issue.code).includes("INTERNAL")), false,
      "a genuine native conversion refusal is not disguised as an invariant");
  });
}
