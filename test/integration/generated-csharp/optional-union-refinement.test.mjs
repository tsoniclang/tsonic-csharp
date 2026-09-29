import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of [undefined, "js"]) {
  test(`optional union refinement retains absence on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
function selectHost(value: string | (() => string) | undefined): string | undefined {
  if (typeof value === "function") return value();
  return value;
}
function kind(value: string | undefined): string { return typeof value; }
class Counter { value = 0; }
function counted(value: string | undefined, calls: Counter): string | undefined { calls.value++; return value; }
function countedNumber(calls: Counter): number { calls.value++; return 3; }
export function run(): boolean {
  const calls = new Counter();
  const present = typeof counted("host", calls);
  const missing = typeof counted(undefined, calls);
  const direct = typeof countedNumber(calls);
  const compared = typeof countedNumber(calls) === "number";
  const inverse = typeof countedNumber(calls) !== "number";
  return selectHost("host") === "host" && selectHost(() => "callback") === "callback" &&
    selectHost(undefined) === undefined && kind("host") === "string" && kind(undefined) === "object" &&
    present === "string" && missing === "object" && direct === "number" && compared && !inverse && calls.value === 5;
}
` });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, "optional-union-refinement");
  });
}
