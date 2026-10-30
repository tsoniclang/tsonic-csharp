import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";

function accepted(compiled, label) {
  const errors = compiled.targetDiagnostics.filter(issue => issue.category === "error");
  const detail = errors.slice(0, 4).map(issue => `${issue.code}: ${issue.message.slice(0, 512)}`).join(" | ");
  assert.equal(errors.length === 0 && compiled.artifacts.size > 0, true, `${label}: ${detail}`);
  return [...compiled.artifacts.values()].join("\n");
}

for (const surface of [undefined, "js"]) {
  const lane = surface ?? "native";
  for (const [name, body] of [
    ["empty true arm", "return flag ? [] : values;"],
    ["empty false arm", "return flag ? values : [];"],
    ["parenthesized arm", "return flag ? (([])) : values;"],
    ["local conditional result", "const selected = flag ? [] : values; return selected;"],
  ]) test(`immediate checked readonly array context retains ${name} on ${lane}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      export function select(flag: boolean, values: readonly string[]) { ${body} }
    ` });
    const output = accepted(compiled, `${lane}/${name}`);
    assert.equal(/\.ToArray\(|\.Select\(|\.Clone\(/u.test(output), false,
      "conditional context does not copy the selected native array");
  });

  test(`immediate conditional array context retains native int64 metadata on ${lane}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      import type { int64 } from "@tsonic/core/types.js";
      export function select(flag: boolean, values: readonly int64[]) { return flag ? [] : values; }
    ` });
    const output = accepted(compiled, `${lane}/native int64`);
    assert.equal(/long/u.test(output), true, "checked native element width remains long");
    assert.equal(/BigInteger|\.ToArray\(|\.Select\(/u.test(output), false,
      "native conditional context neither erases integer width nor copies storage");
  });

  for (const [name, sourceText] of [
    ["both untyped arms", "export function select(flag: boolean) { return flag ? [] : []; }"],
    ["earlier untyped producer", `export function select(flag: boolean, values: readonly string[]) {
      const empty = []; return flag ? empty : values;
    }`],
    ["earlier callable producer", `export function select(flag: boolean, values: readonly string[]) {
      const empty = (() => [])(); return flag ? empty : values;
    }`],
    ["later typed caller", `function make() { return []; }
      export function call(): readonly string[] { return make(); }`],
  ]) test(`conditional array context does not backward-type ${name} on ${lane}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText });
    if (name === "earlier untyped producer") {
      assert.equal(/error TS7034:/u.test(compiled.sourceDiagnosticsText) &&
        /error TS7005:/u.test(compiled.sourceDiagnosticsText), true,
      `${lane}/${name}: the checker still requires the earlier binding's own element annotation`);
      assert.equal(compiled.targetDiagnostics.length === 2 &&
        compiled.targetDiagnostics.every(issue => issue.code === "TSTS_DIAGNOSTIC"), true,
      "both original source-checker diagnostics are retained without target-level inference");
    } else {
      assert.equal(compiled.targetDiagnostics.some(issue => issue.code === "TSONIC_UNTYPED_ARRAY_LITERAL"), true,
        `${lane}/${name}: the original untyped literal still needs its own element context`);
    }
    assert.equal(compiled.artifacts.size, 0, "missing literal context publishes no native artifacts");
  });
}
