import assert from "node:assert/strict";
import test from "node:test";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { compileCsharpSource, assertCsharpCheckingSucceeded, checkCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
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

function checkedArrayFixture(elements) {
  const checked = checkCsharpSource({ sourceText: `import type { int64 } from "@tsonic/core/types.js";
    export function run(input: int64[]): void { void ([${elements}] as int64[]); }` });
  assert.equal(checked.sourceDiagnosticsText, "");
  const source = createTargetSourceProgram(checked.source);
  const expressions = [];
  const visit = node => {
    if (source.ast.is.IsArrayLiteralExpression(node)) expressions.push(node);
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  source.sourceFiles.forEach(file => { if (!source.ast.isDeclarationFile(file)) visit(file); });
  assert.equal(expressions.length, 1);
  const expression = expressions[0];
  const queries = source.semantics.forNode(expression);
  const outcome = source.effectiveTypes.get(expression);
  const assertion = source.ast.parent(expression);
  const annotation = source.ast.as.AsAsExpression(assertion).Type;
  const declared = queries.types.authoredType(annotation);
  assert.equal(declared !== undefined && queries.types.isArrayLike(declared) &&
    source.ast.getSourceFile(annotation) === queries.sourceFile, true,
    "the exact checked array declaration and Native unit occurrence share this real Source publication");
  if (outcome !== undefined) assert.equal(outcome.kind !== "refused" && outcome.type.kind === "array" &&
    outcome.provenance.occurrence === expression, true, "the real array and its chosen carrier share the exact compiled Source publication");
  else assert.equal(source.ast.elements(expression).some(node => node === undefined || source.ast.is.IsOmittedExpression(node)), true,
    "only the real sparse construction is outside the exact C29 descriptor domain");
  return { source, expression, queries, declared, sourceFile: source.ast.getSourceFile(expression) };
}

test("missing native input evidence never fabricates a literal element conversion", () => {
  for (const [label, elements] of [["missing carrier", "1n"], ["missing checked type", "1n"],
    ["missing dense entry", "1n, , 3n"], ["unproven spread operand", "...input"]]) {
    const { source, expression, queries, declared } = checkedArrayFixture(elements);
    const scope = { host: { target: { id: "csharp" }, typeParameterConstraints: {},
      effectiveTypes: source.effectiveTypes, ast: source.ast,
      literalValues: { literalValue: { get: () => undefined } } },
      resolveTypeWithState: () => assert.fail("the removed raw array type path must not be queried"),
      resolveSourceTypeComponentEvidence: component => {
        assert.equal(component.selectedType === declared, true, "the outside-domain Native boundary uses its exact checked annotation");
        return { kind: "array", element: { kind: "source-primitive", name: "int64" } };
      },
      resolveNodeWithState: () => undefined };
    const selected = resolveCsharpArrayLiteralSelection(scope, expression, queries, { depth: 0 });
    assert.equal(selected.kind, "unavailable", `${label}: every native construction input must be proved`);
  }
});

test("the Native array resolver keeps the Host carrier and visits later children after an unavailable input", () => {
  const { source, expression, queries, sourceFile } = checkedArrayFixture("1n, 3n");
  const [first, last] = source.ast.elements(expression);
  const element = { kind: "source-primitive", name: "int64" };
  const observed = [];
  const scope = { host: { target: { id: "csharp" }, typeParameterConstraints: {},
    effectiveTypes: source.effectiveTypes, ast: source.ast,
    projectTypes: () => ({ directSupertypes: () => assert.fail("an exact scalar identity needs no Native hierarchy query") }),
    literalValues: { literalValue: { get: () => undefined } } },
    resolveTypeWithState: () => assert.fail("the Host-selected array never falls back to its checked Type"),
    resolveNodeWithState(node, file, state) {
      assert.equal(file === sourceFile && state.depth === 1, true, "actual child state and Source file are kept");
      observed.push(node);
      return node === first ? undefined : element;
    } };
  const selection = resolveCsharpArrayLiteralSelection(scope, expression, queries, { depth: 0 });
  assert.equal(selection.kind, "unavailable", "one missing child cannot publish the chosen carrier as a successful construction");
  assert.equal(observed.length === 2 && observed[0] === first && observed[1] === last, true,
    "the later Native input is checked in the original order without compaction");
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
  assertAccepted(compiled, `${label}: the function-local group is filled by the declared native slot`);
  const output = [...compiled.artifacts.values()].join("\n");
  assert.equal([...output.matchAll(/new Tsonic\.CSharp\.Node\.MakeDirectoryOptions\b/gu)].length, 1,
    `${label}: the exact original ${literal} keeps one native allocation through every alias`);
  assert.doesNotMatch(output, /TsObject|Activator|DynamicInvoke|System\.Reflection|\.Clone\(|\.ToArray\(/u);
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
