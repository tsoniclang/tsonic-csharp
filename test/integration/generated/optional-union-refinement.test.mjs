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
function limit(value: string | number | undefined): number {
  if (value === undefined) return 10;
  if (typeof value === "number") return value;
  return value === "four" ? 4 : 0;
}
function selectText(value: string | number | undefined): string | undefined {
  if (typeof value === "number") return undefined;
  return value;
}
function exactInteger(value: number | bigint | undefined): bigint {
  if (value === undefined) return 0n;
  if (typeof value === "number") return 1n;
  return value;
}
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
    present === "string" && missing === "object" && direct === "number" && compared && !inverse && calls.value === 5 &&
    limit(undefined) === 10 && limit(8) === 8 && limit("four") === 4 &&
    selectText("kept") === "kept" && selectText(undefined) === undefined && selectText(3) === undefined &&
    exactInteger(undefined) === 0n && exactInteger(7) === 1n && exactInteger(9007199254740993n) === 9007199254740993n;
}
` });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, "optional-union-refinement");
  });
}
