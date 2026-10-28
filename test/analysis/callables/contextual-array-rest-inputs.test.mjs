import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { csharpProgramSourceFiles } from "../../helpers/program-source-files.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { getCsharpNullableElementTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";

for (const surface of ["native", "js"]) {
  test(`array-rest named-self entry retains the authored omittable prefix on ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
let hits = 0;
function fallback(): number { hits += 1; return 7; }
export function run(): boolean {
  hits = 0;
  const f: (prefix: number, ...values: number[]) => number = function inner(
    prefix: number = fallback(), first: number = 0,
  ): number {
    return prefix === 0 ? inner() : prefix + first;
  };
  const alias = f;
  return f(0, 1) === 7 && hits === 1 && alias(2, 3) === 5 && hits === 1;
}` });
    assertCsharpCompilationSucceeded(compiled);
    const program = compiled.result.program;
    const ast = program.source.ast;
    const pending = [...csharpProgramSourceFiles(program)];
    let layouts = 0;
    while (pending.length !== 0) {
      const node = pending.pop();
      if (ast.is.IsFunctionExpression(node)) {
        const contract = program.records.callableDeclaration.get(node)?.contract;
        const prefix = contract?.nativeParameters[0]?.targetParameter;
        const bodyPrefix = contract?.bodyInputs?.parameters[0]?.targetParameter;
        assert.equal(prefix?.optional === true && getCsharpNullableElementTargetType(prefix.type) !== undefined, true,
          "every actual self invocation can transport the authored missing prefix");
        assert.equal(prefix !== undefined && bodyPrefix !== undefined && targetTypeRefEquals(prefix.type, bodyPrefix.type), true,
          "the native prefix and original default body share one canonical carrier");
        assert.equal(contract?.nativeParameters.length === 2 && contract.nativeParameters[1].targetParameter.paramsArray, true,
          "only the tail collapses into the original native rest array");
        layouts += 1;
      }
      ast.forEachChild(node, child => { if (child !== undefined) pending.push(child); });
    }
    assert.equal(layouts, 1, "one authored named-self body and physical input vector");
    const output = [...compiled.artifacts.values()].join("\n");
    assert.equal([...output.matchAll(/\bdouble __tsonic_self_\w+\(/gu)].length, 1,
      "external present and internal omitted inputs use the same original body");
    assert.equal(/DynamicInvoke|System\.Reflection|__tsonic_callable_adapter/u.test(output), false,
      "omission and native rest inputs introduce no forwarding callable or reflective repair");
    executeCsharpConstruction(compiled, `contextual-array-rest-self-default-${surface}`);
  });

  test(`a native array-rest delegate binds named scalar formals in its original body on ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
import type { int64 } from "@tsonic/core/types.js";
export function invoke(values: int64[]): int64 {
  const named: (prefix: string, ...items: int64[]) => int64 = (prefix, first, second) =>
    prefix === "wide" ? first + second : 0n;
  return named("wide", ...values);
}
export function run(): boolean {
  const named: (prefix: string, ...values: int64[]) => int64 = (prefix, first, second) =>
    prefix === "wide" ? first + second : 0n;
  const original: (prefix: string, ...values: int64[]) => int64 = (prefix, ...values) =>
    prefix === "wide" ? values[0] + values[1] : 0n;
  const wide: int64 = 9007199254740993n;
  const alias = named;
  return alias("wide", wide, 2n) === wide + 2n && original("wide", wide, 2n) === wide + 2n;
}` });
    assertCsharpCompilationSucceeded(compiled);
    const program = compiled.result.program;
    const ast = program.source.ast;
    const pending = [...csharpProgramSourceFiles(program)];
    let layouts = 0;
    while (pending.length !== 0) {
      const node = pending.pop();
      if (ast.is.IsArrowFunction(node)) {
        const contract = program.records.callableDeclaration.get(node)?.contract;
        const layout = contract?.bodyInputs;
        if (layout !== undefined) {
          assert.equal(contract.parameters.length, 3, "all original scalar source parameters remain owned");
          assert.equal(contract.nativeParameters.length, 2, "the actual ABI takes a prefix and one original native array");
          assert.deepEqual(layout.adapters.map(adapter => adapter.kind), ["value", "rest-element", "rest-element"],
            "the original body reads its two scalar positions without a second callable");
          assert.deepEqual(layout.adapters.filter(adapter => adapter.kind === "rest-element").map(adapter => adapter.offset), [0, 1],
            "each source scalar reads exactly its native array position");
          layouts += 1;
        }
      }
      ast.forEachChild(node, child => { if (child !== undefined) pending.push(child); });
    }
    assert.equal(layouts, 2, "only named scalar bodies need a layout; the actual authored rest binding is unchanged");
    const output = [...compiled.artifacts.values()].join("\n");
    assert.equal(/Convert\.ToDouble|DynamicInvoke|__tsonic_callable_adapter/u.test(output), false,
      "native rest binding retains wide values without reflective invocation or a forwarding adapter");
    const nativeType = surface === "js" ? "Tsonic.CSharp.Js.JSArray<long>" : "long[]";
    const nativeInput = surface === "js" ? "Tsonic.CSharp.Js.JSArray<long>.of([9007199254740993L, 2L])" : "[9007199254740993L, 2L]";
    executeCsharpConstruction(compiled, `contextual-array-rest-inputs-${surface}`, false, false, [], `
using Index = Tsonic.Generated.Index;
if (!Index.run()) throw new System.Exception("exact native rest input result");
${nativeType} values = ${nativeInput};
if (Index.invoke(values) != 9007199254740995L) throw new System.Exception("wide native scalar rest input");
for (var warmup = 0; warmup < 10000; warmup++) { Index.invoke(values); Native(values); }
var before = System.GC.GetAllocatedBytesForCurrentThread();
long generated = 0;
for (var iteration = 0; iteration < 10000; iteration++) generated ^= Index.invoke(values);
var generatedCost = System.GC.GetAllocatedBytesForCurrentThread() - before;
before = System.GC.GetAllocatedBytesForCurrentThread();
long native = 0;
for (var iteration = 0; iteration < 10000; iteration++) native ^= Native(values);
var nativeCost = System.GC.GetAllocatedBytesForCurrentThread() - before;
if (generated != native || generatedCost != nativeCost) throw new System.Exception($"native rest entry allocation {generatedCost} != {nativeCost}");
before = System.GC.GetTotalAllocatedBytes(true);
for (var iteration = 0; iteration < 10000; iteration++) generated ^= Index.invoke(values);
generatedCost = System.GC.GetTotalAllocatedBytes(true) - before;
before = System.GC.GetTotalAllocatedBytes(true);
for (var iteration = 0; iteration < 10000; iteration++) native ^= Native(values);
nativeCost = System.GC.GetTotalAllocatedBytes(true) - before;
if (generated != native || generatedCost != nativeCost) throw new System.Exception($"all-thread native rest entry allocation {generatedCost} != {nativeCost}");
static long Native(${nativeType} values) {
    static long Body(string prefix, ${nativeType} items) => prefix == "wide" ? items[0] + items[1] : 0L;
    System.Func<string, ${nativeType}, long> named = Body;
    return named("wide", values);
}
`);
  });

  test(`array-rest body entry retains captures, authored defaults and native absence on ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
import type { int64 } from "@tsonic/core/types.js";
let events = "";
function fallback(): int64 { events += "D"; return 9007199254740993n; }
function make(offset: int64): (...values: int64[]) => int64 {
  return (first, second) => first + second + offset;
}
export function run(): boolean {
  events = "";
  const read: (...values: (int64 | undefined)[]) => int64 = (first: int64 = fallback(), second) =>
    first + (second ?? 0n);
  const captured = make(1n);
  if (read(undefined, 2n) !== 9007199254740995n || events !== "D") return false;
  if (read(0n, undefined) !== 0n || events !== "D") return false;
  return captured(9007199254740993n, 2n) === 9007199254740996n;
}` });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `contextual-array-rest-defaults-${surface}`);
  });
}
