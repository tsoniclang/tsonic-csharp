import test from "node:test";
import assert from "node:assert/strict";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

const genericHelper = `
import type { Pointer } from "@tsonic/core/types.js";
import { allocateptr } from "@tsonic/core/lang.js";
export function make<T>(value: T): Pointer<T> { return allocateptr(value); }
export function forward<T>(value: T): Pointer<T> { return make(value); }
`;

const cases = [
  ["cross-file generic activations", `
import type { uint32, int64 } from "@tsonic/core/types.js";
import { loadptr, storeptr, equalptr } from "@tsonic/core/lang.js";
import { make, forward } from "./factory.js";
function word(value: uint32) { return forward(value); }
function wide(value: int64) { return make<int64>(value); }
export function run(): boolean {
  const first = word(4294967295);
  const second = wide(9007199254740993n);
  const other = word(7);
  const alias = first;
  storeptr(alias, 11);
  return equalptr(first, alias) && !equalptr(first, other) &&
    loadptr(first) === 11 && loadptr(other) === 7 && loadptr(second) === 9007199254740993n;
}
`, { "factory.ts": genericHelper }],
  ["open borrowed return and one absence state", `
import type { Pointer, uint32 } from "@tsonic/core/types.js";
import { allocateptr, loadptr, storeptr, equalptr } from "@tsonic/core/lang.js";
export function borrowed(pointer: Pointer<uint32> | null | undefined) { return pointer; }
export function run(): boolean {
  const original = allocateptr<uint32>(3);
  const alias = borrowed(original);
  if (alias === undefined || alias === null) return false;
  storeptr(alias, 9);
  return equalptr(original, alias) && loadptr(original) === 9 &&
    borrowed(undefined) === undefined && borrowed(null) === undefined;
}
`, {}],
  ["addressed parameter frames outlive their calls", `
import type { uint32 } from "@tsonic/core/types.js";
import { addressof, loadptr, storeptr, equalptr } from "@tsonic/core/lang.js";
function addressed(value: uint32) { return addressof(value); }
export function run(): boolean {
  const first = addressed(3);
  const second = addressed(7);
  const alias = first;
  storeptr(alias, 13);
  return equalptr(first, alias) && !equalptr(first, second) &&
    loadptr(first) === 13 && loadptr(second) === 7;
}
`, {}],
  ["return alternatives, local writes and fallthrough", `
import type { uint32 } from "@tsonic/core/types.js";
import { allocateptr, loadptr } from "@tsonic/core/lang.js";
function replaced(flag: boolean) {
  let pointer = allocateptr<uint32>(1);
  if (flag) pointer = allocateptr<uint32>(2);
  return pointer;
}
function optional(flag: boolean) { if (flag) return replaced(true); }
export function run(): boolean {
  const present = optional(true);
  return present !== undefined && loadptr(present) === 2 &&
    loadptr(replaced(false)) === 1 && optional(false) === undefined;
}
`, {}],
];

for (const surface of ["native", "js"]) {
  for (const [label, sourceText, files] of cases) {
    test(`pointer return frames retain ${label} in ${surface}`, { timeout: 300_000 }, () => {
      const compiled = compileCsharpSource({ surface, sourceText, files });
      assertCsharpCompilationSucceeded(compiled);
      const output = [...compiled.artifacts.values()].join("\n");
      assert.doesNotMatch(output, /Location<(?:object|double)>/u);
      executeCsharpConstruction(compiled, `pointer-return-${surface}`);
    });
  }
}

for (const surface of ["native", "js"]) {
  test(`pointer return forwarding adds no allocation in ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
import type { Pointer, uint32 } from "@tsonic/core/types.js";
import { allocateptr } from "@tsonic/core/lang.js";
export function make() { return allocateptr<uint32>(7); }
export function forward(pointer: Pointer<uint32>): Pointer<uint32> { return pointer; }
` });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `pointer-return-cost-${surface}`, false, false, [], `
using System;
using System.Runtime.CompilerServices;
using Tsonic.CSharp.Runtime;
var pointer = Tsonic.Generated.Index.make();
for (int index = 0; index < 10000; index++) {
    _ = Generated(pointer);
    _ = Handwritten(pointer);
}
var generated = Measure(pointer, true);
var handwritten = Measure(pointer, false);
if (generated != 0 || handwritten != 0) throw new Exception($"pointer forwarding allocation: generated={generated}, handwritten={handwritten}");
[MethodImpl(MethodImplOptions.NoInlining)]
static Location<uint> Generated(Location<uint> pointer) => Tsonic.Generated.Index.forward(pointer);
[MethodImpl(MethodImplOptions.NoInlining)]
static Location<uint> Handwritten(Location<uint> pointer) => pointer;
[MethodImpl(MethodImplOptions.NoInlining)]
static long Measure(Location<uint> pointer, bool generated) {
    var before = GC.GetAllocatedBytesForCurrentThread();
    for (int index = 0; index < 10000; index++) {
        var result = generated ? Generated(pointer) : Handwritten(pointer);
        if (!ReferenceEquals(result, pointer)) throw new Exception("pointer return copied its backing");
    }
    return GC.GetAllocatedBytesForCurrentThread() - before;
}
`);
  });
}
