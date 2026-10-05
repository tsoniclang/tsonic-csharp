import assert from "node:assert/strict";
import test from "node:test";
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
    const compiled = compileCsharpSource({ surface, sourceText });
    assertCsharpCompilationSucceeded(compiled);
    assert.equal(/\bdynamic\b|Activator\.|Unsafe\./u.test([...compiled.artifacts.values()].join("\n")), false);
    executeCsharpConstruction(compiled, `destructured-loop-captures-${surface}`);
  });
}
