import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of ["native", "js"]) {
  test(`contextual tuple rest maps named and rest bindings to exact native positions on ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
import type { int32, int64 } from "@tsonic/core/types.js";
export function run(): boolean {
  const named: (...values: [int32, int64, string]) => boolean = (count, wide, label) =>
    count === 7 && wide === 9007199254740993n && label === "ready";
  const rest: (...values: [int32, int64, string]) => boolean = (...values) =>
    values[0] === 7 && values[1] === 9007199254740993n && values[2] === "ready";
  const prefix: (prefix: string, ...values: [int32, int64]) => boolean = (prefix, count, wide) =>
    prefix === "ready" && count === 7 && wide === 9007199254740993n;
  const explicitRest: (...values: [int32, int64, string]) => boolean = (...values: [int32, int64, string]) =>
    values[0] === 7 && values[1] === 9007199254740993n && values[2] === "ready";
  const wide: int64 = 9007199254740993n;
  return named(7, wide, "ready") && rest(7, wide, "ready") &&
    prefix("ready", 7, wide) && explicitRest(7, wide, "ready");
}` });
    assertCsharpCompilationSucceeded(compiled);
    const output = [...compiled.artifacts.values()].join("\n");
    assert.equal(output.includes("long"), true, "the contextual tuple retains its native int64 slot");
    assert.equal(/Convert\.ToDouble|\(double\)wide/u.test(output), false,
      "mapping a native tuple position does not round the selected int64 carrier");
    executeCsharpConstruction(compiled, `contextual-tuple-rest-${surface}`);
  });
}
