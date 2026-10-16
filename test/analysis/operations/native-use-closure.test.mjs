import assert from "node:assert/strict";
import test from "node:test";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { targetUseSiteIdentity } from "@tsonic/target-api/analysis";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { analyzeCsharpBindingPatterns } from "../../../dist/analysis/control-flow/binding-patterns.js";
import { analyzeCsharpNativeDemand } from "../../../dist/analysis/operations/native-demand.js";
import { csharpNativeUseSite } from "../../../dist/target-model/records/native-demand.js";
import { csharpObjectTargetType, csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";

const emissionPrograms = [
  ["class and static initializers", `
    function next(): number { return 3; }
    export class Box { value = next(); static shared = next(); }
    export function run(): number { const box = new Box(); return box.value + Box.shared; }`],
  ["base constructor arguments", `import type { int32 } from "@tsonic/core/types.js";
    export class Base { value: int32; constructor(value: int32) { this.value = value; } }
    export class Derived extends Base { constructor() { super(7 / 2); } }
    export function run(): int32 { return new Derived().value; }`],
  ["parameter, pattern and lambda defaults", `
    function next(): number { return 3; }
    function parameter(value: number = next()): number { return value; }
    function pattern([value = next()]: number[]): number { return value; }
    export function run(): number { const callback = (value: number = next()) => value;
      const [item = next()] = [1]; return parameter() + pattern([]) + callback() + item; }`],
  ["template spans", 'export function run(value: number): string { return `value=${value},next=${value + 1}`; }'],
  ["switch cases", `export function run(value: number): number {
    switch (value) { case 1: return 3; case 2: return 4; default: return 5; } }`],
  ["optional chains", `export interface Box { value: number; }
    export function run(box?: Box): number { return box?.value ?? 3; }`],
  ["sequence spread", `function sum(...values: number[]): number { return values.length; }
    export function run(values: number[]): number { const result = [1, ...values, 2]; return sum(...result); }`],
  ["await operands", `async function first(): Promise<number> { return 3; }
    export async function run(): Promise<number> { return await first(); }`],
  ["yield operands", `import type { int32 } from "@tsonic/core/types.js";
    export function* run(): Generator<int32, string, unknown> { yield 1; yield 2; return "done"; }`],
  ["delete, void and typeof", `export function run(values: number[], value: number): string {
    delete values[0]; void value; return typeof value; }`],
  ["comma expression", `export function run(): number { let value = 0; return (value++, value + 1); }`],
  ["accessor bodies", `export class Box { stored = 1; get value(): number { return this.stored; }
    set value(next: number) { this.stored = next; } }
    export function run(): number { const box = new Box(); box.value = 3; return box.value; }`],
  ["IIFE callee", `export function run(value: number): number { return ((next: number) => next + 1)(value); }`],
  ["module and default export", `function next(): number { return 3; }
    const value = next(); export default value;`],
  ["compound and logical assignments and increments", `export function run(): number {
    let value = 1; value += 2; value++; --value; let optional: number | undefined = value; optional ??= 4; return optional; }`],
  ["attribute argument metadata", `import { attribute } from "@tsonic/core/lang.js";
    import { ObsoleteAttribute } from "@tsonic/dotnet/System.js";
    export class Box { run(): void {} }
    attribute<Box>().add(() => new ObsoleteAttribute("old", false));`],
];

for (const [label, sourceText] of emissionPrograms) test(`sealed emission context covers ${label}`, () => {
  const compiled = compileCsharpSource({ sourceText, surface: "js" });
  assert.equal(compiled.sourceDiagnosticsText === "", true, `${label}: ${compiled.sourceDiagnosticsText}`);
  const errors = compiled.result.diagnostics.filter(diagnostic => diagnostic.category === "error");
  assert.equal(errors.length, 0, `${label}: ${errors.map(diagnostic => `${diagnostic.code}: ${diagnostic.message}`).join("; ")}`);
  assert.equal(compiled.result.program !== undefined && [...compiled.artifacts.keys()].some(path => path.endsWith(".cs")), true,
    `${label}: one sealed program reaches native source emission`);
});

test("tagged template operands have finite contexts without changing the retained source refusal", () => {
  const compiled = compileCsharpSource({ sourceText: `
    function tag(parts: TemplateStringsArray, value: number): string { return parts[0]; }
    export function run(value: number): string { return tag\`value=\${value}\`; }`, surface: "js" });
  assert.equal(compiled.sourceDiagnosticsText === "", true, "the tagged-template control is source-valid");
  const errors = compiled.result.diagnostics.filter(diagnostic => diagnostic.category === "error");
  assert.equal(errors.length === 1 && errors[0].code === "CSHARP_UNSUPPORTED_AST" &&
    errors[0].message === "Expression is outside the current C# planning surface.", true,
    "the unsupported tagged renderer keeps its exact source refusal, never an emission-context invariant");
});

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
    declarations: records, objectShapes: program.objectShapes,
    exactLiteral: records.exactLiteral, propertyKeyBindings: expression => {
      const use = records.nativeUse.expression(expression)?.use;
      return use === undefined || use.kind === "erased" ? undefined : use.propertyKeys;
    },
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

for (const [name, type, expression] of [["integer", "int32", "-2"], ["negative-zero", "float32", "-0"]]) {
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
