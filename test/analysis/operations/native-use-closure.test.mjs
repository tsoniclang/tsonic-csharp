import assert from "node:assert/strict";
import test from "node:test";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { targetUseSiteIdentity } from "@tsonic/target-api/analysis";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { analyzeCsharpBindingPatterns } from "../../../dist/analysis/control-flow/binding-patterns.js";
import { analyzeCsharpNativeDemand } from "../../../dist/analysis/operations/native-demand.js";
import { csharpNativeUseSite } from "../../../dist/target-model/records/native-demand.js";
import { csharpObjectTargetType, csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";

function owners(sourceText, surface = "js") {
  const compiled = compileCsharpSource({ sourceText, surface });
  assert.equal(compiled.sourceDiagnosticsText === "", true, compiled.sourceDiagnosticsText);
  const program = compiled.result.program;
  assert.equal(program !== undefined, true, compiled.result.diagnostics.map(item => `${item.code}: ${item.message}`).join("; "));
  const source = createTargetSourceProgram(compiled.source);
  const ast = source.ast;
  const records = program.records;
  const nodes = [];
  const walk = node => { nodes.push(node); ast.forEachChild(node, child => { if (child !== undefined) walk(child); }); };
  for (const file of program.sourceFiles) walk(file);
  const bindingPatterns = analyzeCsharpBindingPatterns({ ast, semanticsFor: source.semantics.forNode, sourceFiles: program.sourceFiles, participation: records.nativeParticipation,
    evidence: records, operations: records, valueReads: records, objectShapes: program.objectShapes });
  const input = { ast, sourceFiles: program.sourceFiles, navigation: program.sourceNavigation, evidence: records, operations: records,
    valueReads: records, participation: records.nativeParticipation, bindingPatterns, callableCreation: { get: () => undefined },
    attributeApplications: records, classInitialization: records, projectTypes: program.projectTypes,
    classFactories: { classFactory: records.classFactory, factories: program.classFactories },
    expected: { entries: [], pending: [], inactive: [], expectedUse: { get: () => undefined } } };
  const text = node => String(ast.getSourceText(ast.getSourceFile(node))).slice(ast.pos(node), ast.end(node)).trim().replace(/\s+/gu, " ");
  const variable = name => nodes.find(node => ast.is.IsVariableDeclaration(node) && ast.text(ast.name(node)) === name);
  return { ast, nodes, records, input, text, variable };
}

test("every admitted native edge resolves to the one exact immutable publication", () => {
  const value = owners(`import type { int32 } from "@tsonic/core/types.js";
    function identity(value: int32): int32 { return value; }
    export function run(value: int32): int32 { return identity(value) + 1; }`, "native");
  const demand = analyzeCsharpNativeDemand(value.input);
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
  const demand = analyzeCsharpNativeDemand({ ...value.input, callableCreation: { get: node => node === arrow ? { kind: "selected", carrier } : undefined } });
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
  const demand = analyzeCsharpNativeDemand({ ...value.input, expected });
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
  const demand = analyzeCsharpNativeDemand({ ...value.input, expected: { entries, pending: [], inactive: [], expectedUse: { get: () => undefined } } });
  assert.equal(demand.entries.some(entry => entry.use.expression === expression), false, "neither target is silently selected");
  assert.equal(demand.unadmitted.some(entry => entry.expression === expression && entry.reason === "use-context-unresolved"), true, "native-use-closure:98: demand.unadmitted.some(entry => entry.expression === expression && entry.reason === \"use-c");
});
