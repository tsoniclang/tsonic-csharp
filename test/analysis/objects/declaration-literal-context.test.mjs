import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";
import { compileCsharpSource, assertCsharpCheckingSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { testRepositoryRoots } from "../../../../tsonic/test/scripts/workspace-layout.mjs";
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
      diagnostic.message === "This object literal has no target type. Declare a return type for 'make' at its declaration."), true,
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

function assertNativeOptionsContract(compiled, label, recursive, cached = false) {
  assertAccepted(compiled, label);
  const output = [...compiled.artifacts.values()].join("\n");
  assert.equal([...output.matchAll(/new Tsonic\.CSharp\.Node\.MakeDirectoryOptions\b/gu)].length, 1,
    `${label}: one direct native allocation at the original producer`);
  assert.doesNotMatch(output, /TsObject|CreateDynamicObject|Tsonic__ObjectShape|Activator|System\.Reflection|DynamicInvoke/u);
  executeCsharpConstruction(compiled, `complete-native-options-${label.replaceAll(" ", "-")}`, false, false,
    [join(testRepositoryRoots.csharpNodejs, "csharp/src/Tsonic.CSharp.Node/Tsonic.CSharp.Node.csproj")], `
using System;
using Tsonic.CSharp.Node;
using Index = Tsonic.Generated.Index;
var value = Index.make();
if (value.recursive != ${recursive ? "true" : "null"} || value.mode is not null) throw new Exception("exact native optional fields");
var alias = value;
alias.mode = 17;
if (!ReferenceEquals(value, alias) || value.mode != 17) throw new Exception("native alias mutation and identity");
if (ReferenceEquals(value, Index.make()) != ${cached ? "true" : "false"}) throw new Exception("native construction lifetime");
for (int index = 0; index < 10000; index++) {
    GC.KeepAlive(Index.make());
    GC.KeepAlive(Native.Make());
}
long before = GC.GetAllocatedBytesForCurrentThread();
for (int index = 0; index < 8192; index++) GC.KeepAlive(Index.make());
long generated = GC.GetAllocatedBytesForCurrentThread() - before;
before = GC.GetAllocatedBytesForCurrentThread();
for (int index = 0; index < 8192; index++) GC.KeepAlive(Native.Make());
long handwritten = GC.GetAllocatedBytesForCurrentThread() - before;
if (generated != handwritten) throw new Exception($"native option allocation {generated} != {handwritten}");
static class Native {
    ${cached ? "static readonly MakeDirectoryOptions stored = new MakeDirectoryOptions { recursive = true };" : ""}
    public static MakeDirectoryOptions Make() => ${cached ? "stored" : `new MakeDirectoryOptions${recursive ? " { recursive = true }" : "()"}`};
}
`);
}

for (const [label, body] of [
  ["untyped intermediate alias", "const base = {}; const alias = base; const options: MakeDirectoryOptions = alias; return options;"],
  ["mutable context alias", "const base = {}; let options: MakeDirectoryOptions = base; return options;"],
  ["settled item12 chain", "const base = { recursive: true }; const tuned = base; const final = tuned; const options: MakeDirectoryOptions = final; return options;"],
]) test(`complete direct native use set selects the original literal for ${label}`, { timeout: 300_000 }, () => {
  const sourceText = `import type { MakeDirectoryOptions } from "node:fs";
    export function make(): MakeDirectoryOptions { ${body} }`;
  const compiled = compile(sourceText);
  assertNativeOptionsContract(compiled, label, label === "settled item12 chain");
});

test("a module const literal uses its own complete direct typed return contract", { timeout: 300_000 }, () => {
  const sourceText = `const base = { recursive: true };
    export function make(): MakeDirectoryOptions { return base; }`;
  const compiled = compile(`import type { MakeDirectoryOptions } from "node:fs"; ${sourceText}`);
  assertNativeOptionsContract(compiled, "module const", true, true);
});

for (const [label, sourceText] of [
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

for (const [label, body, code, message] of [
  ["an unannotated mutable alias", "const base = {}; let alias = base; const options: MakeDirectoryOptions = alias; return options;",
    "CSHARP_NATIVE_CONSTRUCTION_NOT_PROVEN", "Native construction escapes its closed const-alias use set. Declare a type for 'base' at this initializer."],
  ["no nominal identity requirement", "const base = {}; const alias = base; return alias;",
    "TSONIC_UNTYPED_OBJECT_LITERAL", "This object literal has no target type. Declare a type for 'base' at this initializer."],
]) test(`complete direct native use set precisely refuses ${label}`, () => {
  const sourceText = `import type { MakeDirectoryOptions } from "node:fs";
    export function make(): ${code === "TSONIC_UNTYPED_OBJECT_LITERAL" ? "unknown" : "MakeDirectoryOptions"} { ${body} }`;
  const compiled = compile(sourceText);
  const issues = compiled.result.diagnostics.filter(diagnostic => diagnostic.category === "error");
  assert.equal(issues.length, 1, `${label}: one original literal owns the unavailable native contract`);
  const refusal = issues[0];
  assert.equal(refusal.code, code);
  assert.equal(refusal.message, message,
  `${label}: exact own-binding hint and precise closed-use cause`);
  const range = refusal.sourceNode === undefined ? undefined : compiled.source.ast.authoredRange(refusal.sourceNode);
  assert.equal(range?.kind === "authored" && range.start === sourceText.indexOf("{}") &&
    range.end === sourceText.indexOf("{}") + 2, true, `${label}: the original literal owns the refusal`);
  assert.equal(compiled.result.program === undefined && compiled.plan === undefined && compiled.artifacts.size === 0, true,
    `${label}: zero publication without a proved native identity requirement`);
});

for (const surface of ["native", "js"]) {
  test(`mutable checked callable bindings retain authored native parameter and result widths on ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      import type { int32, int64 } from "@tsonic/core/types.js";
      function exact(value: int32): int32 { return value; }
      export function run(): boolean {
        let selected = (value: int32): int32 => value;
        let copied = exact;
        let wide = (value: int64): int64 => value;
        return selected(7 as int32) === copied(7 as int32) &&
          wide(9007199254740993n as int64) === 9007199254740993n;
      }
    ` });
    assertCsharpCheckingSucceeded(compiled);
    assertAccepted(compiled, `${surface}: checked mutable callable native components`);
    const source = [...compiled.artifacts.values()].join("\n");
    assert.equal(/Func<int, int> selected/u.test(source), true, `${surface}: the mutable callable keeps its exact int32 ABI`);
    assert.equal(/Func<long, long> wide/u.test(source), true, `${surface}: the mutable callable keeps its exact int64 ABI`);
    executeCsharpConstruction(compiled, `mutable-native-callable-${surface}`, false, false, [], `
if (!Tsonic.Generated.Index.run()) throw new System.Exception("mutable callable native widths and exact wide result");
`);
  });
}
