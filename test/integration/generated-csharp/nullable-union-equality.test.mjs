import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCheckingSucceeded, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of [undefined, "js"]) {
  test(`nullable closed union equality preserves absence, identity and evaluation order on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
import type { int32, int64 } from "@tsonic/core/types.js";
class Entry { value: int32 = 3 as int32; }
type Value = string | Entry | int64;
type OptionalValue = Value | null | undefined;
class Effects { order: string = ""; }
function equal(left: OptionalValue, right: OptionalValue): boolean { return left === right; }
function different(left: OptionalValue, right: OptionalValue): boolean { return left !== right; }
function equalText(left: OptionalValue, right: string | null | undefined): boolean { return left === right; }
function equalEntry(left: OptionalValue, right: Entry | null | undefined): boolean { return left === right; }
function reversed(right: Entry, left: OptionalValue): boolean { return right === left; }
function first(effects: Effects, value: OptionalValue): OptionalValue { effects.order += "L"; return value; }
function second(effects: Effects, value: OptionalValue): OptionalValue { effects.order += "R"; return value; }
export function run(): boolean {
  const entry = new Entry();
  const distinct = new Entry();
  if (!equal(null, undefined) || different(undefined, null)) return false;
  if (equal(undefined, entry) || equal(entry, null) || equal(null, "text")) return false;
  if (!equal(entry, entry) || equal(entry, distinct) || equal(entry, "text")) return false;
  if (!equalText("text", "text") || equalText("text", "other") || !equalText(undefined, null)) return false;
  if (!equalEntry(entry, entry) || equalEntry(entry, distinct) || !equalEntry(null, undefined)) return false;
  if (!reversed(entry, entry) || reversed(entry, undefined)) return false;
  if (!equal(9007199254740993n as int64, 9007199254740993n as int64) ||
      equal(9007199254740993n as int64, 9007199254740992n as int64)) return false;
  const effects = new Effects();
  if (!equal(first(effects, entry), second(effects, entry)) || effects.order !== "LR") return false;
  effects.order = "";
  if (!equal(first(effects, null), second(effects, undefined)) || effects.order !== "LR") return false;
  entry.value = 7 as int32;
  return equal(entry, entry) && entry.value === (7 as int32);
}
` });
    assertCsharpCompilationSucceeded(compiled);
    const generated = [...compiled.artifacts].filter(([path]) => path.endsWith(".cs")).map(([, text]) => text).join("\n");
    assert.doesNotMatch(generated, /\bAny\b|\bReflection\b|\bDynamicInvoke\b|\bActivator\b|\(object\)/u);
    executeCsharpConstruction(compiled, "nullable-union-equality");
  });
  test(`nullable closed union equality rejects incompatible native signed widths on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
import type { int64, uint64 } from "@tsonic/core/types.js";
export function forbidden(left: string | int64 | undefined, right: uint64): boolean { return left === right; }
` });
    assertCsharpCheckingSucceeded(compiled);
    assert.ok(compiled.result.diagnostics.some(diagnostic => diagnostic.category === "error" &&
      /Union equality requires exact native comparison evidence for every leaf pair/u.test(diagnostic.message)),
    JSON.stringify(compiled.targetDiagnostics));
    assert.equal(compiled.artifacts.size, 0);
  });
}
