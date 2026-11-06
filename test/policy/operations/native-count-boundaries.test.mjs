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
    if (name.endsWith("split") && label === "declared floating") continue;
    test(`${name} refuses an actual ${label} Source argument before emission`, () => {
      const sourceText = declaration === ""
        ? `export function run(): void { ${expression.replaceAll("value", "2147483648")}; }`
        : `export function run(${declaration}): void { ${expression}; }`;
      const compiled = compileCsharpSource({ surface: "js", sourceText });
      const errors = compiled.result.diagnostics.filter(diagnostic => diagnostic.category === "error");
      assert.equal(errors.length, 1, `${name}: ${label}`);
      const diagnostic = errors[0];
      assert.equal(diagnostic.code, "CSHARP_UNSUPPORTED_AST", `${name}: ${label}`);
      assert.equal(diagnostic.message, declaration === ""
        ? "Source bigint literal is outside the exact 'int32' range."
        : name === "asIntN" || name === "asUintN"
          ? "No exact C# implicit conversion relates 'source:float64' to 'source:int32'."
          : "No exact C# implicit conversion relates 'source:float64' to 'target:System.Nullable`1<source:int32>'.", `${name}: ${label}`);
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
