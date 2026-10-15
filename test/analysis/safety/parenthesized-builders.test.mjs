import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";

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
