import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of [undefined, "js"]) {
  test(`nested union regrouping retains exact payloads on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
import type { uint64 } from "@tsonic/core/types.js";
type TextOrValues = string | uint64[];
type FlagOrAction = boolean | (() => uint64);
type Grouped = TextOrValues | FlagOrAction;
type Flat = string | uint64[] | boolean | (() => uint64);
type Generic<T> = string | T[];
function readGeneric(value: Generic<uint64>): uint64 {
  return typeof value === "string" ? 0n : value[0];
}
function group(value: Flat): Grouped { return value; }
function flatten(value: Grouped): Flat { return value; }
function read(value: Flat): uint64 {
  if (typeof value === "boolean") return value ? 1n : 0n;
  if (typeof value === "string") return 2n;
  if (typeof value === "function") return value();
  return value[0];
}
export function run(): boolean {
  const wide: uint64 = 9007199254740993n;
  const values = [wide];
  if (readGeneric(values) !== wide) return false;
  const grouped = group(values);
  ${surface === undefined ? "" : "values[0] = wide + 1n;"}
  return read(flatten(grouped)) === ${surface === undefined ? "wide" : "wide + 1n"} && read(flatten(group("text"))) === 2n &&
    read(flatten(group(true))) === 1n && read(flatten(group(() => wide))) === wide;
}
` });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, "nested-union-mappings");
  });
}
