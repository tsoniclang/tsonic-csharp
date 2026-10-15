import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { nativeAbsenceJsonSource } from "../../../../tsonic/test/fixtures/native-absence.mjs";

test("JSON absence selections retain every authored argument effect", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: nativeAbsenceJsonSource }), "native-absence-json");
});

for (const surface of [undefined, "js"]) {
  test(`nullable union conversions retain values and effects (${surface ?? "native"})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
import type { int32 } from "@tsonic/core/types.js";
let reads: int32 = 0;
function read(value: int32 | undefined): int32 | undefined { reads++; return value; }
function widen(value: int32 | undefined): int32 | string | undefined { return read(value); }
function select(value: int32 | string | null | undefined): string {
  if (value === null || value === undefined) return "absent";
  return typeof value === "string" ? value : value === 7 ? "seven" : "zero";
}
function count(): int32 { return reads; }
export function run(): boolean {
  const missing = widen(undefined);
  const zero = widen(0);
  const seven = widen(7);
  return select(missing) === "absent" && select(null) === "absent" &&
    select(zero) === "zero" && select(seven) === "seven" && select("text") === "text" && count() === 3;
}
` });
    executeCsharpConstruction(compiled, `nullable-union-effects-${surface ?? "native"}`);
    assert.doesNotMatch([...compiled.artifacts.values()].join("\n"), /Runtime\.(?:Null|Undefined|Optional)</u);
  });
}

test("nullable union resources dispose only present arms once in reverse order", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
import type { int32 } from "@tsonic/core/types.js";
let reads: int32 = 0;
let disposed = "";
class First { [Symbol.dispose](): void { disposed += "1"; } }
class Second { [Symbol.dispose](): void { disposed += "2"; } }
class Async { async [Symbol.asyncDispose](): Promise<void> { disposed += "a"; } }
function sync(value: First | Second | null | undefined): First | Second | null | undefined { reads++; return value; }
function asyncValue(value: First | Async | null | undefined): First | Async | null | undefined { reads++; return value; }
function counts(): int32 { return reads; }
function order(): string { return disposed; }
export async function run(): Promise<boolean> {
  {
    using first = sync(new First());
    using missing = sync(null);
    using second = sync(new Second());
    using omitted = sync(undefined);
    void first; void missing; void second; void omitted;
  }
  if (order() !== "21" || counts() !== 4) return false;
  {
    await using first = asyncValue(new First());
    await using missing = asyncValue(undefined);
    await using second = asyncValue(new Async());
    await using omitted = asyncValue(null);
    void first; void missing; void second; void omitted;
  }
  return order() === "21a1" && counts() === 8;
}
` });
  executeCsharpConstruction(compiled, "nullable-union-disposal", true);
});
