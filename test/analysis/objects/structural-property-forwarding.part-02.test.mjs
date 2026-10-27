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

for (const surface of Array.from(["native", "js"]).slice(1, 2)) {
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
