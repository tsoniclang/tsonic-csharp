import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCheckingSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { createTsonicPlugin as nodejsCapability } from "../../../../csharp-nodejs/dist/index.js";
import { selectCsharpArrayLiteralCarrier } from "../../../dist/policy/types/collections/literal-construction.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";
import { resolveCsharpArrayLiteralSelection } from "../../../dist/analysis/source-evidence/types/resolution/array-literals.js";

function compile(sourceText) {
  const compiled = compileCsharpSource({ surface: "js", capabilities: [nodejsCapability()], sourceText });
  assertCsharpCheckingSucceeded(compiled);
  return compiled;
}

function assertAccepted(compiled, label) {
  assert.equal(compiled.targetDiagnostics.length, 0,
    `${label}: ${compiled.targetDiagnostics.map(diagnostic => `${diagnostic.code}: ${diagnostic.message}`).join("; ")}`);
  assert.equal(compiled.artifacts.size > 0, true, `${label}: native source published`);
}

for (const [name, body] of [
  ["variable", "const value: MakeDirectoryOptions = {}; return value;"],
  ["return", "return {};"],
  ["immediate local use", "const value = {}; const typed: MakeDirectoryOptions = value; return typed;"],
  ["already typed local aliases", "const value: MakeDirectoryOptions = {}; const alias = value; const typed: MakeDirectoryOptions = alias; return typed;"],
  ["parameter", "function accept(value: MakeDirectoryOptions): MakeDirectoryOptions { return value; } return accept({});"],
  ["property", "const value: { options: MakeDirectoryOptions } = { options: {} }; return value.options;"],
]) test(`object literal uses only its checked ${name} context`, () => {
  const compiled = compile(`import type { MakeDirectoryOptions } from "node:fs";
    export function make(): MakeDirectoryOptions { ${body} }`);
  assertAccepted(compiled, name);
  const output = [...compiled.artifacts.values()].join("\n");
  assert.equal([...output.matchAll(/new Tsonic\.CSharp\.Node\.MakeDirectoryOptions\b/gu)].length, 1,
    `${name}: one original native allocation`);
  assert.doesNotMatch(output, /TsObject|Activator|DynamicInvoke|System\.Reflection/u);
});

for (const callers of ["", "export function caller(): MakeDirectoryOptions { return make(); }"])
  test(`untyped object return asks for its own annotation${callers === "" ? " without a caller" : " despite a typed caller"}`, () => {
    const compiled = compile(`import type { MakeDirectoryOptions } from "node:fs";
      function make() { return {}; } ${callers}`);
    assert.equal(compiled.targetDiagnostics.some(diagnostic => diagnostic.code === "TSONIC_UNTYPED_OBJECT_LITERAL" &&
      diagnostic.message === "This object literal has no target type. Declare one, e.g. 'function baseOptions(): MakeDirectoryOptions'."), true,
      "the original literal needs an annotation, not caller-based reconstruction");
    assert.equal(compiled.artifacts.size, 0, "annotation refusal publishes no executable source");
  });

for (const callers of ["", "export function caller(): number[] { return make(); }"])
  test(`untyped array return asks for its own element annotation${callers === "" ? " without a caller" : " despite a typed caller"}`, () => {
    const compiled = compile(`function make() { return []; } ${callers}`);
    assert.equal(compiled.targetDiagnostics.some(diagnostic => diagnostic.code === "TSONIC_UNTYPED_ARRAY_LITERAL" &&
      diagnostic.message === "This empty array has no element type. Declare one, e.g. 'function emptyBuffer(): number[]'."), true,
      "the original empty array needs an element annotation");
    assert.equal(compiled.artifacts.size, 0, "annotation refusal publishes no executable source");
  });

test("declared generic and exact native array elements survive local construction", () => {
  const compiled = compile(`import type { int64 } from "@tsonic/core/types.js";
    export function empty<T>(): T[] { return []; }
    export function wide(value: int64): int64[] { return [value]; }
    export function declared(): number[] { const values: number[] = []; return values; }
    export function ownElements() { return [1, 2]; }`);
  assertAccepted(compiled, "generic and native elements");
  const output = [...compiled.artifacts.values()].join("\n");
  assert.match(output, /empty<T>/u);
  assert.match(output, /JSArray<long>/u);
  assert.doesNotMatch(output, /\.Clone\(|\.ToArray\(/u);
});

test("a literal consumed as any is refused instead of selecting dynamic object backing", () => {
  const compiled = compile(`export function run(): number {
    const value: any = { field: 1 }; return value.field;
  }`);
  assert.equal(compiled.targetDiagnostics.some(diagnostic => diagnostic.code === "TSONIC_ANY_UNSUPPORTED" &&
    diagnostic.message === "'any' has no native representation. Declare the type, or use 'unknown' and narrow it."), true,
    "a consumed any requests a declared native type");
  assert.equal(compiled.artifacts.size, 0, "no dynamic construction fallback");
});

test("tuple construction consumes the exact contextual element carriers rather than inferred literal carriers", () => {
  const element = { kind: "source-primitive", name: "int64" };
  const array = { kind: "array", element };
  const source = { kind: "tuple", elements: [{ kind: "source-primitive", name: "float64" }, element] };
  const required = { kind: "tuple", elements: [{ kind: "source-primitive", name: "uint8" }, element] };
  assert.equal(selectCsharpArrayLiteralCarrier(required, source), required, "declared tuple carrier");
  assert.equal(selectCsharpArrayLiteralCarrier(required, undefined), required, "declaration needs no repaired source");
  assert.equal(selectCsharpArrayLiteralCarrier(array, source), array, "declared array carrier");
  assert.equal(targetTypeRefEquals(selectCsharpArrayLiteralCarrier(element, array), element), false,
    "a scalar is not an exact array construction carrier");
});

test("declared literal construction checks every native element conversion", () => {
  const compiled = compile(`import type { uint64, int64 } from "@tsonic/core/types.js";
    export function values(first: int64, second: uint64): int64[] { return [first, second]; }`);
  assert.equal(compiled.targetDiagnostics.some(diagnostic => diagnostic.category === "error"), true,
    "a later incompatible native element cannot use the first element's identity conversion");
  assert.equal(compiled.artifacts.size, 0, "unproven native element conversion publishes nothing");
});

test("missing dense input remains refused without compacting array elisions", () => {
  const compiled = compile("export function values(): number[] { return [1, , 3] as number[]; }");
  assert.equal(compiled.targetDiagnostics.some(diagnostic => /elision|Sparse/u.test(diagnostic.message)), true,
    "missing input never fabricates or compacts a native element");
  assert.equal(compiled.artifacts.size, 0, "unproven sparse construction publishes nothing");
});

test("declared native array spread uses the real sequence owner rather than alias repair", () => {
  const compiled = compile("export function values(input: number[]): number[] { return [1, ...input, 3]; }");
  assertAccepted(compiled, "typed spread");
  const output = [...compiled.artifacts.values()].join("\n");
  assert.doesNotMatch(output, /\.Clone\(|\.ToArray\(/u);
});

test("missing native input evidence never fabricates a literal element conversion", () => {
  const arrayType = {};
  const elementType = {};
  const element = { kind: "source-primitive", name: "int64" };
  const array = { kind: "array", element };
  for (const [label, entry, checked] of [["missing carrier", {}, elementType],
    ["missing checked type", {}, undefined], ["missing dense entry", undefined, elementType],
    ["unproven spread operand", { kind: "spread" }, elementType]]) {
    const expression = { elements: [entry] };
    const queries = { sourceFile: {}, types: {
      expressionType: node => node === expression ? arrayType : checked,
      isTuple: () => false,
    } };
    const scope = {
      host: { ast: { is: { IsArrayLiteralExpression: node => node === expression,
        IsSpreadElement: node => node?.kind === "spread" },
        as: { AsSpreadElement: node => node }, elements: node => node.elements } },
      resolveTypeWithState: type => type === arrayType ? array : element,
      resolveNodeWithState: () => undefined,
    };
    const selected = resolveCsharpArrayLiteralSelection(scope, expression, queries, { depth: 0 });
    assert.equal(selected.kind, "unavailable", `${label}: every native construction input must be proved`);
  }
});

test("an explicit generic call preserves the enclosing function's declared T array", () => {
  const compiled = compile(`function identity<T>(values: T[]): T[] { return values; }
    export function empty<T>(): T[] { return identity<T>([]); }`);
  assertAccepted(compiled, "enclosing generic T");
  const output = [...compiled.artifacts.values()].join("\n");
  assert.match(output, /empty<T>/u);
  assert.match(output, /identity<T>/u);
});

test("already-typed local aliases have no spelling-distance limit", () => {
  const aliases = Array.from({ length: 12 }, (_unused, index) =>
    `const alias${index} = ${index === 0 ? "original" : `alias${index - 1}`};`).join("\n");
  const compiled = compile(`import type { MakeDirectoryOptions } from "node:fs";
    export function make(): MakeDirectoryOptions { const original: MakeDirectoryOptions = {};
      ${aliases} return alias11; }`);
  assertAccepted(compiled, "checked aliases");
  const output = [...compiled.artifacts.values()].join("\n");
  assert.equal([...output.matchAll(/new Tsonic\.CSharp\.Node\.MakeDirectoryOptions\b/gu)].length, 1,
    "arbitrarily spelled checked aliases keep the original allocation");
});

for (const [label, body, literal] of [
  ["untyped intermediate alias", "const base = {}; const alias = base; const options: MakeDirectoryOptions = alias; return options;", "{}"],
  ["mutable context alias", "const base = {}; let options: MakeDirectoryOptions = base; return options;", "{}"],
  ["settled item12 chain", "const base = { recursive: true }; const tuned = base; const final = tuned; const options: MakeDirectoryOptions = final; return options;", "{ recursive: true }"],
]) test(`C1202 requests the original literal annotation for ${label}`, () => {
  const sourceText = `import type { MakeDirectoryOptions } from "node:fs";
    export function make(): MakeDirectoryOptions { ${body} }`;
  const compiled = compile(sourceText);
  const issue = compiled.result.diagnostics.find(diagnostic => diagnostic.code === "TSONIC_UNTYPED_OBJECT_LITERAL");
  const ast = compiled.source.ast;
  const range = issue?.sourceNode === undefined ? undefined : ast.authoredRange(issue.sourceNode);
  const text = range?.kind !== "authored" ? undefined
    : ast.getSourceText(ast.getSourceFile(issue.sourceNode)).slice(range.start, range.end);
  assert.equal(issue?.message === "This object literal has no target type. Declare one, e.g. 'function baseOptions(): MakeDirectoryOptions'." &&
    text === literal, true, `${label}: exact annotation diagnostic at the original literal, not the final conversion`);
  assert.equal(compiled.result.program === undefined && compiled.artifacts.size === 0, true,
    `${label}: no unproved native construction is published`);
});

for (const [label, sourceText] of [
  ["another body", `const base = { recursive: true };
    export function make(): MakeDirectoryOptions { return base; }`],
  ["declared structural context", `export function make(): MakeDirectoryOptions {
    const base: { recursive: boolean } = { recursive: true }; const alias = base; return alias; }`],
  ["a parameter without a literal declaration", `export function make(base: { recursive: boolean }): MakeDirectoryOptions {
    return base; }`],
]) test(`failed native conversion retains its own diagnostic for ${label}`, () => {
  const compiled = compile(`import type { MakeDirectoryOptions } from "node:fs"; ${sourceText}`);
  assert.equal(compiled.targetDiagnostics.some(diagnostic => diagnostic.code === "CSHARP_UNSUPPORTED_AST" &&
    diagnostic.message.startsWith("No exact C# implicit conversion relates ")), true,
  `${label}: an unrelated native conversion is not an untyped-literal refusal`);
  assert.equal(compiled.targetDiagnostics.some(diagnostic => diagnostic.code === "TSONIC_UNTYPED_OBJECT_LITERAL"), false,
    `${label}: no original literal is guessed or retyped`);
  assert.equal(compiled.result.program === undefined && compiled.artifacts.size === 0, true,
    `${label}: rejected native conversion publishes no program`);
});
