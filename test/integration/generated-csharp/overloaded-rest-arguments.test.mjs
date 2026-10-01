import assert from "node:assert/strict";
import test from "node:test";
import { overloadedRestCallbackSource, overloadedRestIntegerSource, overloadedRestOverrideSource } from "../../../../tsonic/test/fixtures/overloaded-rest-arguments.mjs";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

test("overloaded rest callbacks use the selected element and preserve effects", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: overloadedRestCallbackSource });
  assertCsharpCompilationSucceeded(compiled);
  executeCsharpConstruction(compiled, "overloaded-rest-callbacks");
});

for (const surface of [undefined, "js"]) {
  const lane = surface ?? "native";
  test(`overloaded exact and virtual dispatch remain distinct in ${lane}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: overloadedRestOverrideSource });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `overloaded-rest-overrides-${lane}`);
  });
  test(`overloaded and generic rest arguments retain exact native integers in ${lane}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: overloadedRestIntegerSource });
    assertCsharpCompilationSucceeded(compiled);
    const output = [...compiled.artifacts.values()].join("\n");
    assert.match(output, /9007199254740993/u);
    assert.doesNotMatch(output, /BigInteger|\.ToArray\(|\.Select\(/u);
    executeCsharpConstruction(compiled, `overloaded-rest-integers-${lane}`);
  });
}

test("overloaded rest calls reject incompatible selected elements", () => {
  const compiled = compileCsharpSource({ sourceText: `
    class Collector {
      collect(mode: "empty"): void;
      collect(mode: string, ...values: number[]): void;
      collect(mode: string, ...values: number[]): void {}
    }
    export function run(): void { new Collector().collect("run", "wrong"); }
  ` });
  assert.match(compiled.sourceDiagnosticsText, /TS2345/u);
  assert.equal(compiled.result.artifacts.length, 0);
});
