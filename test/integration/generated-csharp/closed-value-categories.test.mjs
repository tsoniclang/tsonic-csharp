import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

test("closed values retain native categories and checked primitive projections across files", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", files: { "values.ts": `
export function category(value: unknown): string { return typeof value; }
export function describe(value: unknown): string {
  if (typeof value === "string") return value.substring(0, 3);
  if (typeof value === "boolean") return value ? "true" : "false";
  return typeof value;
}
export function take(value: unknown): string {
  if (typeof value === "string") return value;
  return "other";
}
` }, sourceText: `
import type { int32, int64, uint64, float32 } from "@tsonic/core/types.js";
import { category, describe, take } from "./values.js";
export function run(): boolean {
  const small: int32 = 42;
  const signed: int64 = -9007199254740993n;
  const unsigned: uint64 = 18446744073709551615n;
  const single: float32 = 0.1;
  return category(small) === "number" && category(single) === "number" &&
    category(signed) === "bigint" && category(unsigned) === "bigint" &&
    describe("native text") === "nat" && describe(true) === "true" &&
    describe(false) === "false" && describe(undefined) === "object" &&
    take("moved") === "moved" && take(17) === "other";
}
` });
  assertCsharpCompilationSucceeded(compiled);
  executeCsharpConstruction(compiled, "closed-value-categories");
});
