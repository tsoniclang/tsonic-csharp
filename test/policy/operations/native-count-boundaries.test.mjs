import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";

const operations = [
  ["clearTimeout", "clearTimeout(value)"],
  ["clearInterval", "clearInterval(value)"],
  ["asIntN", "BigInt.asIntN(value, 9n)"],
  ["asUintN", "BigInt.asUintN(value, 9n)"],
  ["string split", '"a,b".split(",", value)'],
  ["RegExp string split", '"a,b".split(/,/, value)'],
  ["RegExp symbol split", '/,/[Symbol.split]("a,b", value)'],
];

test("native timer handles and BigInt bit counts consume actual int32 Source slots", () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    import type { int32 } from "@tsonic/core/types.js";
    export function run(value: int32): bigint {
      clearTimeout(value);
      clearInterval(value);
      clearTimeout();
      clearInterval(undefined);
      "a,b".split(",", undefined);
      "a,b".split(/,/, undefined);
      /,/[Symbol.split]("a,b", undefined);
      return BigInt.asIntN(value, BigInt.asUintN(value, 9n));
    }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  const text = compiled.artifacts.get("src/Index.cs");
  assert.match(text, /run\(int value\)/u);
  assert.match(text, /Timers\.clearTimeout\(value\)/u);
  assert.match(text, /BigIntOps\.asIntN\(value,/u);
});

for (const [name, expression] of operations) {
  for (const [label, declaration] of [
    ["declared floating", "value: number"],
    ["out-of-range integer", ""],
  ]) {
    test(`${name} refuses an actual ${label} Source argument before emission`, () => {
      const sourceText = declaration === ""
        ? `export function run(): void { ${expression.replaceAll("value", "2147483648")}; }`
        : `export function run(${declaration}): void { ${expression}; }`;
      const compiled = compileCsharpSource({ surface: "js", sourceText });
      const errors = compiled.result.diagnostics.filter(diagnostic => diagnostic.category === "error");
      assert.equal(errors.length, 1, `${name}: ${label}`);
      const diagnostic = errors[0];
      assert.equal(diagnostic.code, "CSHARP_UNSUPPORTED_AST", `${name}: ${label}`);
      const reason = name === "asIntN" || name === "asUintN"
        ? "No exact C# implicit conversion relates 'source:float64' to 'source:int32'."
        : "No exact C# implicit conversion relates 'source:float64' to 'target:System.Nullable`1<source:int32>'.";
      assert.equal(diagnostic.message, declaration === ""
        ? "Source bigint literal is outside the exact 'int32' range."
        : `${reason} Annotate the value with an integral type.`, `${name}: ${label}`);
      assert.equal(diagnostic.sourceNode !== undefined, true, `${name}: original argument node`);
      const range = compiled.source.ast.authoredRange(diagnostic.sourceNode);
      assert.equal(range.kind, "authored", `${name}: exact authored argument range`);
      const argument = declaration === "" ? "2147483648" : "value";
      assert.equal(range.start, sourceText.lastIndexOf(argument), `${name}: actual argument occurrence`);
      assert.equal(range.end, range.start + argument.length, `${name}: actual argument extent`);
      assert.equal(compiled.artifacts.size, 0, `${name}: no emission for a refused native count`);
    });
  }
}

const delayOperations = [
  ["setTimeout", "setTimeout(() => {}, value)"],
  ["setInterval", "setInterval(() => {}, value)"],
];

for (const [name, expression] of delayOperations) {
  test(`${name} refuses an actual declared floating Source delay before emission`, () => {
    const sourceText = `export function run(value: number): void { ${expression}; }`;
    const compiled = compileCsharpSource({ surface: "js", sourceText });
    const errors = compiled.result.diagnostics.filter(diagnostic => diagnostic.category === "error");
    assert.equal(errors.length, 1, `${name}: declared floating delay`);
    const diagnostic = errors[0];
    assert.equal(diagnostic.code, "CSHARP_UNSUPPORTED_AST", `${name}: declared floating delay`);
    assert.equal(diagnostic.message,
      "No exact C# implicit conversion relates 'source:float64' to 'source:int32'. Annotate the value with an integral type.",
      `${name}: declared floating delay`);
    assert.equal(diagnostic.sourceNode !== undefined, true, `${name}: original delay argument node`);
    const range = compiled.source.ast.authoredRange(diagnostic.sourceNode);
    assert.equal(range.kind, "authored", `${name}: exact authored delay argument range`);
    assert.equal(range.start, sourceText.lastIndexOf("value"), `${name}: actual delay argument occurrence`);
    assert.equal(range.end, range.start + "value".length, `${name}: actual delay argument extent`);
    assert.equal(compiled.artifacts.size, 0, `${name}: no emission for a refused native delay`);
  });
}

for (const [name, expression] of [...delayOperations, ...operations.filter(([name]) => name.endsWith("split"))]) {
  test(`${name} admits the same Source argument with its declared int32 slot`, () => {
    const sourceText = `import type { int32 } from "@tsonic/core/types.js"; export function run(value: int32): void { ${expression}; }`;
    const compiled = compileCsharpSource({ surface: "js", sourceText });
    assertCsharpCompilationSucceeded(compiled);
    const text = compiled.artifacts.get("src/Index.cs");
    assert.match(text, /run\(int value\)/u);
    assert.doesNotMatch(text, /Convert\.ToInt32|checked\(\(int\)value\)/u);
  });
}
