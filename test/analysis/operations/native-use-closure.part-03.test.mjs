import assert from "node:assert/strict";
import test from "node:test";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { createSourceStorageQuery, targetUseSiteIdentity } from "@tsonic/target-api/analysis";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { analyzeCsharpBindingPatterns } from "../../../dist/analysis/control-flow/binding-patterns.js";
import { analyzeCsharpNativeDemand } from "../../../dist/analysis/operations/native-demand.js";
import { csharpNativeUseSite } from "../../../dist/target-model/records/native/native-demand.js";
import { csharpObjectTargetType, csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { getCsharpArrayLiteralElementTargetType } from "../../../dist/target-model/types/carriers/collections.js";
import { getCsharpRuntimeUnionArms } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { memoryAbiCapability } from "../../helpers/memory-abi.mjs";
import { createCsharpProviderRelationResolver } from "../../../dist/providers/native/projection/relation-resolution.js";
import { csharpProgramSourceFiles } from "../../helpers/program-source-files.mjs";
import { emissionPrograms, discardedPrograms, owners } from "./native-use-closure.fixtures.mjs";

test("native void completion preserves effectful absent calls and the selected conditional branch", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ sourceText: `
    let calls = 0;
    function absent(): undefined { calls++; return undefined; }
    function condition(): boolean { calls++; return true; }
    function call(): void { return (absent()); }
    function branch(): void { return condition() ? absent() : absent(); }
    export function run(): boolean { call(); branch(); return calls === 3; }
  ` });
  assert.equal(compiled.sourceDiagnosticsText === "" && compiled.targetDiagnostics.length === 0, true,
    `native void effect control: ${compiled.sourceDiagnosticsText}; ${compiled.targetDiagnostics.map(({ message }) => message).join("; ")}`);
  const output = [...compiled.artifacts].filter(([path]) => path.endsWith(".cs")).map(([, text]) => text).join("\n");
  const voidBodies = output.match(/public static void (?:call|branch)\(\)[\s\S]*?\n        \}/gu) ?? [];
  assert.equal(voidBodies.length, 2, "both native void methods reach emission");
  assert.equal(voidBodies.some(body => /return null/u.test(body)) || /default\(void\)|_ = null/u.test(output), false,
    "the native completion never fabricates a void value or a null effect");
  executeCsharpConstruction(compiled, "native-void-absent-effect-order");
});

test("every admitted native edge resolves to the one exact immutable publication", () => {
  const value = owners(`import type { int32 } from "@tsonic/core/types.js";
    function identity(value: int32): int32 { return value; }
    export function run(value: int32): int32 { return identity(value) + 1; }`, "native");
  const demand = analyzeCsharpNativeDemand(value.input, []);
  assert.equal(demand.unadmitted.length, 0, demand.unadmitted.map(entry => entry.reason).join("; "));
  assert.equal(demand.entries.length > 3, true, "nonvacuous closure");
  const keys = new Map();
  for (const entry of demand.entries) {
    const identities = keys.get(entry.site.subject) ?? new Set();
    assert.equal(identities.has(targetUseSiteIdentity(entry.site)), false, "one write per native use");
    identities.add(targetUseSiteIdentity(entry.site)); keys.set(entry.site.subject, identities);
    assert.equal(demand.nativeUse.get(entry.site) === entry.use, true, "lookup is the published object");
    if (entry.use.kind === "erased") continue;
    for (const child of entry.use.children) assert.equal(demand.nativeUse.get(child) !== undefined, true, `closed child ${child.role}`);
  }
});

test("an alternative never does not erase the other branch or a callable creation", () => {
  const value = owners(`function fail(): never { throw new Error("stop"); }
    export function choose(flag: boolean): number { return flag ? fail() : 3; }
    export const callback: () => never = () => fail();`);
  const arrow = value.nodes.find(node => value.ast.is.IsArrowFunction(node));
  const carrier = value.records.valueRead.get(arrow)?.value;
  assert.equal(carrier !== undefined, true, "native-use-closure:58: carrier !== undefined");
  const demand = analyzeCsharpNativeDemand({ ...value.input, callableCreation: { get: node => node === arrow ? { kind: "selected", carrier } : undefined } }, []);
  const conditional = demand.entries.find(entry => entry.use.kind !== "erased" && entry.use.evaluation.kind === "conditional");
  assert.equal(conditional !== undefined && conditional.use.completion.kind === "value", true, "native-use-closure:61: conditional !== undefined && conditional.use.completion.kind === \"value\"");
  const creation = demand.entries.find(entry => entry.use.expression === arrow);
  assert.equal(creation !== undefined && creation.use.kind !== "erased" && creation.use.evaluation.kind === "creation" &&
    creation.use.completion.kind === "value" && creation.use.children.length === 0, true, "native-use-closure:64: creation !== undefined && creation.use.kind !== \"erased\" && creation.use.evaluation.kind =");
  assert.equal(demand.nativeUse.order(arrow)?.length > 0, true, "the body is still in compilation order");
});

test("a physical collection carrier survives a never completion before its outer conversion", () => {
  const value = owners(`function fail(): never { throw new Error("stop"); } export const result: number[] = [fail()];`);
  const declaration = value.variable("result");
  const expression = value.ast.as.AsVariableDeclaration(declaration).Initializer;
  const carrier = Object.freeze({ kind: "array", element: csharpSourcePrimitiveTargetType("float64") });
  const target = csharpObjectTargetType();
  const site = csharpNativeUseSite(declaration, { kind: "initializer" }, { target });
  const stage = csharpNativeUseSite(expression, { kind: "constructed-result" }, { target });
  const use = Object.freeze({ expression, carrier, target, strength: "required", exactInteger: false, mode: "implicit", representation: "convert",
    children: Object.freeze([stage]), construction: Object.freeze({ site: stage, carrier, children: Object.freeze([]) }) });
  const expected = { entries: [{ site, use }], pending: [], inactive: [], expectedUse: { get: request =>
    request.subject === site.subject && targetUseSiteIdentity(request) === targetUseSiteIdentity(site) ? use : undefined } };
  const demand = analyzeCsharpNativeDemand({ ...value.input, expected }, []);
  const constructed = demand.nativeUse.get(stage);
  const converted = demand.nativeUse.get(site);
  assert.equal(constructed?.kind === "constructed" && constructed.carrier === carrier && constructed.completion.kind === "never", true, "native-use-closure:83: constructed?.kind === \"constructed\" && constructed.carrier === carrier && constructed.comp");
  assert.equal(converted?.kind === "converted" && converted.carrier === carrier && converted.target === target && converted.completion.kind === "never", true, "native-use-closure:84: converted?.kind === \"converted\" && converted.carrier === carrier && converted.target === t");
});

test("different finalized contexts and pending data remain private, not a first-target fallback", () => {
  const value = owners("export const result = 1;", "native");
  const declaration = value.variable("result");
  const expression = value.ast.as.AsVariableDeclaration(declaration).Initializer;
  const entries = ["int32", "float64"].map(name => {
    const target = csharpSourcePrimitiveTargetType(name);
    return { site: csharpNativeUseSite(declaration, { kind: "initializer" }, { target }), use: {
      expression, carrier: target, target, strength: "required", exactInteger: false, mode: "implicit", representation: "construct", children: [] } };
  });
  const demand = analyzeCsharpNativeDemand({ ...value.input, expected: { entries, pending: [], inactive: [], expectedUse: { get: () => undefined } } }, []);
  assert.equal(demand.entries.some(entry => entry.use.expression === expression), false, "neither target is silently selected");
  assert.equal(demand.unadmitted.some(entry => entry.expression === expression && entry.reason === "use-context-unresolved"), true, "native-use-closure:98: demand.unadmitted.some(entry => entry.expression === expression && entry.reason === \"use-c");
});

test("actual native key refusals precede expected-slot pending and retain every original diagnostic", () => {
  const value = owners("export const result = { first: 1, second: 2 };", "native");
  const declaration = value.variable("result");
  const expression = value.ast.as.AsVariableDeclaration(declaration).Initializer;
  const names = value.ast.properties(expression).map(property => value.ast.name(property));
  assert.equal(names.length === 2 && names.every(name => name !== undefined), true, "two actual checked property identities");
  const issues = names.map((sourceNode, index) => Object.freeze({ category: "error", source: "tsonic-csharp",
    code: "CSHARP_COMPUTED_FIELD_NAME_NOT_PROVEN", sourceNode, message: `Exact selected key refusal ${index}.`, requiredBy: [expression] }));
  const site = csharpNativeUseSite(declaration, { kind: "initializer" });
  const demand = analyzeCsharpNativeDemand({ ...value.input, nativeExpressionIssues: issues,
    expected: { ...value.input.expected, pending: [{ site, expression, reason: "inconsistent-request" }] } }, []);
  assert.equal(demand.unadmitted.length, 2, "both selected key refusals replace pending at the actual use root");
  assert.equal(demand.unadmitted.every((entry, index) => entry.kind === "source-refusal" && entry.requiredBy === expression &&
    entry.diagnostic === issues[index]), true, "the original diagnostic and actual required expression keep separate identities");
  assert.equal(demand.nativeUse.expression(expression) === undefined, true, "a refused expression never receives a fabricated native use");
});

for (const surface of Array.from(["native", "js"]).slice(0, 2)) {
test(`${surface} actual ambient admission precedes pending slots without observing an erased body`, () => {
  const value = owners(`
declare const external: number;
export function run(): number {
  function hidden(): number { return external; }
  return 42;
}`, surface);
  const hidden = value.nodes.find(node => value.ast.is.IsFunctionDeclaration(node) && value.ast.text(value.ast.name(node)) === "hidden");
  const reference = value.nodes.find(node => value.ast.is.IsIdentifier(node) && value.ast.text(node) === "external" &&
    value.ast.is.IsReturnStatement(value.ast.parent(node)));
  assert.equal(hidden !== undefined && reference !== undefined && value.records.nativeParticipation.get(hidden) === "erased", true,
    "the real canonical producer erases the exact original dormant body and retains its checked reference");
  const dormant = analyzeCsharpNativeDemand(value.input, []);
  assert.equal(dormant.unadmitted.length === 0 && dormant.nativeUse.expression(reference) === undefined, true,
    "native demand does not invent an implementation obligation for an erased body");
  const site = csharpNativeUseSite(value.ast.parent(reference), { kind: "return" });
  const demand = analyzeCsharpNativeDemand({ ...value.input,
    participation: { get: node => node === hidden ? "body" : value.input.participation.get(node) },
    expected: { ...value.input.expected, pending: [{ site, expression: reference, reason: "inconsistent-request" }] },
  }, []);
  const refusals = demand.unadmitted.filter(entry => entry.kind === "source-refusal");
  const refusal = refusals[0];
  assert.equal(refusals.length === 1 && refusal.requiredBy === reference && refusal.diagnostic.sourceNode === reference &&
    refusal.diagnostic.code === "CSHARP_AMBIENT_VALUE_IMPLEMENTATION_MISSING" &&
    refusal.diagnostic.message === "A runtime read of an authored ambient variable requires an exact native implementation.", true,
  "the same actual runtime reference reports its original source refusal before an expected-slot pending or missing-fact invariant");
  assert.equal(demand.unadmitted.some(entry => entry.kind === "pending-use" && entry.expression === reference), false,
    "the precise implementation refusal is not replaced by pending carrier evidence");
  assert.equal(demand.nativeUse.expression(reference) === undefined, true,
    "refused actual use cannot publish an invented native binding or expression");
});
}

for (const [label, body, expression, family] of Array.from([
  ["call", "function make(): number { return 1; } export const result = make();", "make()", "selectedCall"],
  ["construction", "class Box { value = 1; } export const result = new Box();", "new Box()", "selectedConstruction"],
  ["property", "const box = { value: 1 }; export const result = box.value;", "box.value", "selectedProperty"],
  ["element", "const values = [1]; export const result = values[0];", "values[0]", "selectedElement"],
]).slice(0, 4)) {
test(`a selected ${label} refusal reaches analysis with its canonical code, node, reason and complete evidence`, () => {
  const value = owners(body, "native");
  const node = value.nodes.find(candidate => value.text(candidate) === expression &&
    value.input.operations[family].get(candidate) !== undefined);
  assert.equal(node !== undefined, true, `${label}: the real operation owner publishes its selected boundary`);
  const original = value.input.operations[family].get(node);
  for (const publicCode of ["DO_NOT_SUBSTITUTE_PUBLIC_CODE", undefined]) {
    const diagnostic = Object.freeze({ extensionId: "test-source-policy", extensionCode: "EXACT_NATIVE_RELATION",
      ...(publicCode === undefined ? {} : { publicCode }), numericCode: 9101001, category: "error",
      nodeOrSpan: node, message: `Selected ${label} native relation is not closed.`, evidence: Object.freeze([
        Object.freeze({ message: "The selected physical carrier is exact." }),
        Object.freeze({ message: "Its required native relation is absent." }),
        Object.freeze({ message: "The selected physical carrier is exact." }),
      ]) });
    const target = Object.freeze({ kind: "rejected", diagnostic });
    const selected = label === "property" ? { ...original, selection: target }
      : { ...original, target };
    const operations = { ...value.input.operations, [family]: { get: candidate => candidate === node
      ? selected : value.input.operations[family].get(candidate) } };
    const demand = analyzeCsharpNativeDemand({ ...value.input, operations }, []);
    const refusals = demand.unadmitted.filter(entry => entry.kind === "source-refusal");
    const refusal = refusals[0];
    assert.equal(refusals.length === 1 && refusal.requiredBy === node && refusal.diagnostic.sourceNode === node &&
      refusal.diagnostic.code === (publicCode ?? "TS9101001") && refusal.diagnostic.category === diagnostic.category &&
      refusal.diagnostic.source === diagnostic.extensionId && refusal.diagnostic.message === diagnostic.message, true,
    `${label}: the canonical mapper preserves an explicit public code or the exact numeric fallback, selected node, category, owner and reason`);
    assert.equal(refusal.diagnostic.evidence?.length === 2 &&
      refusal.diagnostic.evidence[0] === diagnostic.evidence[0].message &&
      refusal.diagnostic.evidence[1] === diagnostic.evidence[1].message && Object.isFrozen(refusal.diagnostic.evidence), true,
    `${label}: all distinct evidence survives once, in its original order`);
    assert.equal(demand.nativeUse.expression(node) === undefined, true,
      `${label}: a refused operation is never published as an accepted native use`);
  }
});
}

test("an actual selected empty construct differs from an erased construct for native key requirements", () => {
  const value = owners("export function accept(): void {}", "native");
  const declaration = value.nodes.find(node => value.ast.is.IsFunctionDeclaration(node));
  const sourceNode = value.ast.name(declaration);
  const issue = Object.freeze({ category: "error", source: "tsonic-csharp", code: "CSHARP_COMPUTED_FIELD_NAME_NOT_PROVEN",
    sourceNode, message: "Exact selected native signature key refusal.", requiredBy: [declaration] });
  const selected = analyzeCsharpNativeDemand({ ...value.input, nativeExpressionIssues: [issue] }, []);
  assert.equal(selected.unadmitted.length === 1 && selected.unadmitted[0].kind === "source-refusal" &&
    selected.unadmitted[0].requiredBy === declaration && selected.unadmitted[0].diagnostic === issue, true,
  "a valid empty native signature still admits its exact key requirements");
  const erased = analyzeCsharpNativeDemand({ ...value.input, nativeExpressionIssues: [issue],
    participation: { get: node => node === declaration ? "erased" : value.input.participation.get(node) } }, []);
  assert.equal(erased.unadmitted.length, 0, "the same owner-selected erasure has no native key obligation");
  assert.equal(erased.nativeUse.order(declaration)?.length, 0, "erasure keeps the established empty native order");
});

for (const [name, type, expression] of Array.from([["integer", "int32", "-2"], ["negative-zero", "float32", "-0"]]).slice(0, 2)) {
test(`a finalized ${name} literal is one native construction without its source spelling operand`, () => {
    const value = owners(`import type { ${type} } from "@tsonic/core/types.js"; export const result: ${type} = ${expression};`, "native");
    const declaration = value.variable("result");
    const initializer = value.ast.as.AsVariableDeclaration(declaration).Initializer;
    const carrier = csharpSourcePrimitiveTargetType(type);
    const literal = value.records.exactLiteral.get(initializer, carrier);
    assert.equal(literal?.kind === "resolved", true, "the real literal producer admits the authored token");
    const site = csharpNativeUseSite(declaration, { kind: "initializer" }, { target: carrier });
    const use = Object.freeze({ expression: initializer, carrier, target: carrier, strength: "required", exactInteger: false,
      mode: "implicit", representation: "construct", children: Object.freeze([]), literal: literal.recipe });
    const expected = { entries: [{ site, use }], pending: [], inactive: [], expectedUse: { get: request =>
      request.subject === site.subject && targetUseSiteIdentity(request) === targetUseSiteIdentity(site) ? use : undefined } };
    const demand = analyzeCsharpNativeDemand({ ...value.input, expected }, []);
    const selected = demand.nativeUse.get(site);
    assert.equal(selected?.kind === "constructed" && selected.carrier === carrier && selected.completion.kind === "value", true,
      "one exact native literal carrier and completing construction");
    assert.equal(selected.children.length, 0, "literal token spelling does not create a runtime operand");
    assert.equal(demand.entries.some(entry => entry.site.subject === initializer && entry.site.role === "operand:only"), false,
      "no source-unary operand is admitted for the finalized literal");
    assert.equal(demand.requiredBindingRoots.includes(declaration), true, "the completing initializer requires its binding root");
  });
}

test("binding requirements follow actual completion and retain signature parameters", () => {
  const value = owners(`
    function fail(): never { throw new Error("stop"); }
    export interface Contract { accept([value]: [number]): number; }
    function make(value: number): [number] { return [value]; }
    export function run(): number { const [value] = make(fail()); return value; }
  `);
  const demand = analyzeCsharpNativeDemand(value.input, []);
  const stopped = value.nodes.find(node => value.ast.is.IsVariableDeclaration(node) &&
    value.ast.is.IsArrayBindingPattern(value.ast.name(node)));
  assert.equal(stopped !== undefined, true, "one destructuring declaration");
  assert.equal(demand.requiredBindingRoots.includes(stopped), false, "a never-completing initializer needs no projection payload");
  const parameter = value.nodes.find(node => value.ast.is.IsParameterDeclaration(node) &&
    value.ast.is.IsArrayBindingPattern(value.ast.name(node)));
  assert.equal(parameter !== undefined, true, "one signature parameter");
  assert.equal(demand.requiredBindingRoots.includes(parameter), true, "a retained signature keeps its parameter projection requirement");
  assert.equal(Object.isFrozen(demand.requiredBindingRoots), true, "required-root publication is immutable");
});

test("the canonical native binding domain includes actual local declarations and selects catch bindings once", () => {
  const value = owners(`
    export function initializerless<T>(value: T): T {
      let T: T | undefined;
      if (T === undefined) return value;
      return T;
    }
    export function named<T>(value: T): T {
      function T(other: T): T { return other; }
      return T(value);
    }
    export function used<T>(value: T): T {
      try { return value; }
      catch (T) { if (T instanceof Error) return value; throw T; }
    }
    export function rethrown<T>(value: T): T { try { return value; } catch (T) { throw T; } }
    export function unused<T>(value: T): T { try { return value; } catch (T) { return value; } }
  `, "native");
  const demand = analyzeCsharpNativeDemand(value.input, []);
  const initializerless = value.nodes.find(node => value.ast.is.IsVariableDeclaration(node) &&
    value.ast.is.IsVariableDeclarationList(value.ast.parent(node)) && value.ast.text(value.ast.name(node)) === "T");
  const localFunction = value.nodes.find(node => value.ast.is.IsFunctionDeclaration(node) &&
    value.ast.text(value.ast.name(node)) === "T");
  assert.equal(initializerless !== undefined && demand.requiredBindingRoots.includes(initializerless), true,
    "an actual initializer-less native local has a binding even without an initializer use");
  assert.equal(localFunction !== undefined && value.records.nativeParticipation.get(localFunction) === "body" &&
    demand.requiredBindingRoots.includes(localFunction), true,
  "a native local function's existing body participation owns its emitted value name");
  const clauses = value.nodes.filter(node => value.ast.is.IsCatchClause(node));
  assert.equal(clauses.length, 3, "all original used, rethrow-only and unused catch clauses are present");
  for (const [index, clause] of clauses.entries()) {
    const declaration = value.ast.as.AsCatchClause(clause).VariableDeclaration;
    const order = demand.nativeUse.order(clause);
    assert.equal(declaration !== undefined && order !== undefined, true, "the actual checked clause and its order are published");
    const required = index === 0;
    assert.equal(demand.requiredBindingRoots.includes(declaration), required,
      `${index}: only an actual source value use retains the authored catch binding`);
    assert.equal(order.some(step => step.kind === "construct" && step.construct === declaration), required,
      `${index}: the data-only backend consumes the same canonical catch selection`);
    assert.equal(demand.nativeUse.order(declaration) !== undefined, required,
      `${index}: an omitted binding has no separate native construct to be reselected`);
  }
});
