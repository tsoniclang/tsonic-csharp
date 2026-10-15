import assert from "node:assert/strict";
import test from "node:test";
import {
  assertCsharpCompilationSucceeded,
  compileCsharpSource,
} from "../../../helpers/direct-csharp-session.mjs";

for (const surface of ["native", "js"]) {
  test(`${surface} checked local aliases add no executable statements`, () => {
    const baseline = compileCsharpSource({ surface, sourceText: `
      export function run(): number {
        let total = 0;
        for (let index = 0; index < 3; index++) {
          total += index;
        }
        return total;
      }
    ` });
    const aliased = compileCsharpSource({ surface, sourceText: `
      export function run(): number {
        type Counter = number;
        let total: Counter = 0;
        for (let index = 0; index < 3; index++) {
          type Callback = (count: number) => number;
          total += index;
        }
        return total;
      }
    ` });
    assertCsharpCompilationSucceeded(baseline);
    assertCsharpCompilationSucceeded(aliased);
    assert.equal(aliased.artifacts.size, baseline.artifacts.size);
    for (const [path, source] of baseline.artifacts) {
      assert.equal(aliased.artifacts.get(path), source, `unchanged native artifact ${path}`);
    }
  });
}
