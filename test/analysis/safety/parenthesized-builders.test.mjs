import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { csharpProgramSourceFiles } from "../../helpers/program-source-files.mjs";

const header = `import { safety, unsafecontext } from "@tsonic/core/lang.js";
import type { int32 } from "@tsonic/core/types.js";

export class Value {
  private stored: int32 = 1;
  get current(): int32 { return this.stored; }
  set current(value: int32) { this.stored = value; }
}
`;

function compile(body) {
  const compiled = compileCsharpSource({ sourceText: `${header}${body}\n`,
    targetOptions: { languageDialect: "csharp15-preview", memorySafetyRules: "preview" } });
  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  return compiled.result.artifacts.filter(artifact => artifact.path.endsWith(".cs"))
    .map(artifact => artifact.text).join("\n");
}

const pairs = [
  ["a getter safety builder statement",
    `safety<Value>().property(value => value.current).getter().requiresunsafe();
export function read(value: Value): int32 { return unsafecontext(value.current); }`,
    `(safety<Value>().property(value => value.current).getter().requiresunsafe());
export function read(value: Value): int32 { return unsafecontext(value.current); }`,
    [/unsafe get/u, /return unsafe\(value\.current\);/u], true],
  ["a setter safety builder statement and a remaining-block unsafe context",
    `safety<Value>().property(value => value.current).setter().requiresunsafe();
export function write(value: Value, next: int32): void { unsafecontext(); value.current = next; }`,
    `(safety<Value>().property(value => value.current).setter().requiresunsafe());
export function write(value: Value, next: int32): void { (unsafecontext()); value.current = next; }`,
    [/unsafe set/u, /unsafe\s*\{\s*value\.current = next;/u], true],
  ["an unsafe expression",
    `safety<Value>().property(value => value.current).getter().requiresunsafe();
export function read(value: Value): int32 { return unsafecontext(value.current); }`,
    `safety<Value>().property(value => value.current).getter().requiresunsafe();
export function read(value: Value): int32 { return (unsafecontext(value.current)); }`,
    [/unsafe get/u, /return \(?unsafe\(value\.current\)\)?;/u], false],
];

for (const [name, plain, parenthesized, required, identical] of pairs) {
  test(`C# erases ${name} the same with or without parentheses`, { timeout: 300_000 }, () => {
    const expected = compile(plain);
    const actual = compile(parenthesized);
    for (const pattern of required) {
      assert.match(expected, pattern);
      assert.match(actual, pattern);
    }
    for (const output of [expected, actual]) {
      assert.doesNotMatch(output, /__tsonic_module_init|ModuleInitializerAttribute|safety<|requiresunsafe|unsafecontext/u,
        "compile-time safety statements leave no runtime module initialization or call");
    }
    if (identical) assert.equal(actual, expected);
    else assert.equal(actual.replace("return (unsafe(value.current));", "return unsafe(value.current);"), expected,
      "the parenthesized unsafe expression differs only by its retained source parentheses");
  });
}

for (const surface of ["native", "js"]) {
  test(`nested unsafe parentheses retain every original native child once in ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `${header}
      safety<Value>().property(value => value.current).getter().requiresunsafe();
      let reads: int32 = 0;
      function selected(): Value { reads++; return new Value(); }
      export function read(): int32 { return (((unsafecontext(selected().current)))); }
      export function readCount(): int32 { return reads; }
    `, targetOptions: { languageDialect: "csharp15-preview", memorySafetyRules: "preview" } });
    assert.equal(compiled.sourceDiagnosticsText, "", "the supported checked source is unchanged");
    assert.equal(compiled.extensionDiagnostics.length, 0, "the original explicit unsafe scope remains admitted");
    assert.equal(compiled.targetDiagnostics.length, 0,
      compiled.targetDiagnostics.map(({ code, message }) => `${code}: ${message}`).join("; "));
    const program = compiled.result.program;
    assert.equal(program !== undefined, true, "native analysis publishes the exact sealed program");
    const ast = program.source.ast;
    const wrappers = [];
    const calls = [];
    const visit = node => {
      if (ast.is.IsParenthesizedExpression(node)) wrappers.push(node);
      if (ast.is.IsCallExpression(node)) {
        const callee = ast.as.AsCallExpression(node).Expression;
        if (ast.is.IsIdentifier(callee) && ["unsafecontext", "selected"].includes(ast.text(callee))) calls.push(node);
      }
      ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
    };
    csharpProgramSourceFiles(program).forEach(visit);
    assert.equal(wrappers.length, 3, "the source retains all three original parentheses");
    assert.equal(calls.length, 2, "the unsafe invocation and its effectful receiver are distinct exact calls");
    const sites = new Set();
    for (const wrapper of wrappers) {
      const selected = program.records.nativeExpression.get(wrapper);
      assert.equal(selected?.physical !== undefined, true, "each actual wrapper has its own sealed native emission context");
      assert.equal(selected.use.expression === wrapper, true, "the use belongs to the original wrapper node");
      assert.equal(selected.physical.children.length, 1, "a source-transparent wrapper evaluates one immediate child");
      const child = program.records.nativeUse.get(selected.physical.children[0]);
      assert.equal(child?.expression === ast.as.AsParenthesizedExpression(wrapper).Expression, true,
        "the original immediate operand is demanded rather than skipped by an inherited safety handler");
      sites.add(selected.site);
    }
    assert.equal(sites.size, 3, "no two wrappers share one duplicated emission context");
    for (const call of calls) {
      const selected = program.records.nativeExpression.get(call);
      assert.equal(selected?.physical !== undefined && selected.use.expression === call, true,
        "the unsafe operation and effectful receiver each retain their own exact consumption");
    }
  });
}
