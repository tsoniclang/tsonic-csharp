import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of [undefined, "js"]) {
  test(`closed nominal union widening preserves live identity and virtual dispatch on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
import type { int32 } from "@tsonic/core/types.js";
class Base { value: int32 = 3 as int32; read(): int32 { return this.value; } }
class Derived extends Base { read(): int32 { return (this.value + 1) as int32; } }
type Narrow = string | Derived;
type Wide = string | Base;
type Broad = boolean | Derived | string;
function widen(value: Narrow): Wide { return value; }
function widenOptional(value: Narrow | null | undefined): Wide | null | undefined { return value; }
function narrowAndWiden(value: Broad): Wide {
  if (typeof value === "boolean") return "excluded";
  const result: Wide = value;
  if (typeof value === "string" && value !== "native text") return "invalid retained string";
  return result;
}
class Counter { calls: int32 = 0 as int32; }
function produce(value: Narrow, counter: Counter): Narrow { counter.calls++; return value; }
export function run(): boolean {
  const original = new Derived();
  const narrow: Narrow = original;
  const counter = new Counter();
  const widened = widen(produce(narrow, counter));
  if (typeof widened === "string") return false;
  if (widened !== original || widened.read() !== (4 as int32) || counter.calls !== (1 as int32)) return false;
  original.value = 8 as int32;
  if (widened.read() !== (9 as int32)) return false;
  if (widen("native text") !== "native text") return false;
  const broad: Broad = original;
  const fused = narrowAndWiden(broad);
  if (typeof fused === "string" || fused !== original || fused.read() !== (9 as int32)) return false;
  return narrowAndWiden("native text") === "native text" && narrowAndWiden(false) === "excluded" &&
    widenOptional(undefined) === undefined && widenOptional(null) === undefined && widenOptional(original) === original;
}
` });
    assertCsharpCompilationSucceeded(compiled);
    const generated = [...compiled.artifacts].filter(([path]) => path.endsWith(".cs")).map(([, text]) => text).join("\n");
    assert.doesNotMatch(generated, /\bAny\b|\bReflection\b|\bDynamicInvoke\b|\bActivator\b/u);
    executeCsharpConstruction(compiled, "project-union-upcasts");
  });
}
