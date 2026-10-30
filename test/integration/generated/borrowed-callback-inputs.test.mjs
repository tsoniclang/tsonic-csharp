import assert from "node:assert/strict";
import test from "node:test";
import { borrowedCallbackInputSource } from "../../../../tsonic/test/fixtures/borrowed-callback-inputs.mjs";
import { assertCsharpCheckingSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of [undefined, "js"]) {
  test(`selected callback inputs preserve native repeated mutation and readonly aliases (${surface ?? "native"})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: borrowedCallbackInputSource });
    assertCsharpCheckingSucceeded(compiled);
    assert.throws(() => executeCsharpConstruction(compiled, `borrowed-callback-type-error-${surface ?? "native"}`),
      error => error?.actual === 1 && error?.expected === 0 && /error CS1503:/u.test(error.message) &&
        /long|Int64/u.test(error.message) && /double|Double/u.test(error.message),
      "the ORIGINAL int64-to-number[] mismatch must reach the actual native compiler; an early Tsonic refusal is still OPEN");
  });

  for (const [variant, sourceText] of [
    ["declared", borrowedCallbackInputSource.replace("const values = [1, 2];", "const values: number[] = [1, 2];")],
    ["written", borrowedCallbackInputSource.replace("const values = [1, 2];", "const values = [1.0, 2.0];")],
  ]) test(`selected ${variant} floating callback inputs preserve native repeated mutation and readonly aliases (${surface ?? "native"})`,
    { timeout: 300_000 }, () => {
      const compiled = compileCsharpSource({ surface, sourceText });
      executeCsharpConstruction(compiled, `borrowed-callback-inputs-${variant}-${surface ?? "native"}`);
      const source = compiled.artifacts.get("src/Index.cs");
      assert.doesNotMatch(source, /\.ToArray\(|\.ToList\(|Array\.Copy\(|\.Clone\(/u,
        "the declared/written native floating storage reaches both callbacks without an array copy");
    });

  test(`native integer defaults and division preserve exact values on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      class Counter { count = 3; }
      export function run(): boolean {
        const wide = 9007199254740993;
        const values = [1, 2];
        const counter = new Counter();
        let local = 42;
        local += 1;
        const quotient = 5 / 2;
        const floating = 5 / 2.0;
        return wide === 9007199254740993 && values[0] === 1 && values[1] === 2 &&
          counter.count === 3 && local === 43 && quotient === 2 && floating === 2.5;
      }
    ` });
    executeCsharpConstruction(compiled, `integer-defaults-${surface ?? "native"}`);
    const source = compiled.artifacts.get("src/Index.cs");
    assert.equal(/long\s+wide\s*=\s*9007199254740993L/u.test(source) && /long\s+count\s*=/u.test(source) &&
      /long\s+local\s*=\s*42L/u.test(source) && /long\s+quotient\s*=\s*5L\s*\/\s*2L/u.test(source), true,
      "local and property integer defaults use the exact native int64 carrier, not double or int32");
  });
}
