import assert from "node:assert/strict";
import test from "node:test";
import { assertNativeLoopRefusals } from "../../helpers/native-loop-refusals.mjs";
import {
  assertCsharpCompilationSucceeded,
  compileCsharpSource,
} from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

const sourceText = `
  export function objectIterations(): boolean {
    let previous: (() => number) | undefined;
    let visits = 0;
    outer: for (let { index } = { index: visits++ }; index < 6; index++) {
      if (previous !== undefined && previous() !== index - 1) return false;
      previous = () => index;
      try { continue outer; }
      finally { index += 1; }
    }
    return visits === 1 && previous !== undefined && previous() === 5;
  }
  export function arrayIterations(): boolean {
    let previous: (() => number) | undefined;
    let visits = 0;
    outer: for (let [index] = [visits++]; index < 6; index++) {
      if (previous !== undefined && previous() !== index - 1) return false;
      previous = () => index;
      try { continue outer; }
      finally { index += 1; }
    }
    return visits === 1 && previous !== undefined && previous() === 5;
  }
  export function run(): boolean {
    return objectIterations() && arrayIterations();
  }
`;

for (const surface of ["native", "js"]) {
  test(`${surface} destructured loop headers initialize once and retain live iteration storage`, { timeout: 300_000 }, () => {
    const refused = compileCsharpSource({ surface, sourceText });
    assertNativeLoopRefusals(refused, [{ message: "the loop variable is captured by a closure and also written in the loop; use a separate variable.", text: "index += 1", occurrence: 0 },
      { message: "the loop variable is captured by a closure and also written in the loop; use a separate variable.", text: "index += 1", occurrence: 1 }]);
    const compiled = compileCsharpSource({ surface, sourceText: sourceText.replaceAll(
      "try { continue outer; }\n      finally { index += 1; }", "continue outer;") });
    assertCsharpCompilationSucceeded(compiled);
    assert.equal(/\bdynamic\b|Activator\.|Unsafe\./u.test([...compiled.artifacts.values()].join("\n")), false);
    executeCsharpConstruction(compiled, `destructured-loop-captures-${surface}`);
  });
}
