import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { compileCsharpSource, assertCsharpCheckingSucceeded, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { memoryAbiCapability } from "../../helpers/memory-abi.mjs";
import { nativeRecordProvider } from "../../helpers/native-record-proof.mjs";

const relaySource = `
import type { Pointer } from "@tsonic/core/types.js";
export function relay<T>(value: Pointer<T>): Pointer<T> { return value; }
`;

const argumentSource = `
import { abi } from "test:abi";
import { relay } from "./relay.js";
import { addressof, allocateptr, equalptr, loadptr, memorylayout, reinterpretrawptr,
  storeptr, torawptr, unsafecontext } from "@tsonic/core/lang.js";
import type { Pointer, uint32 } from "@tsonic/core/types.js";
const word = memorylayout<uint32>({ datalayout: abi, bytesize: 4, bytealignment: 4, stride: 4, fields: [] });
interface Holder { pointer: Pointer<uint32> }
function selected(holder: Holder): Pointer<uint32> { return relay(holder.pointer); }
export function forward(value: Pointer<uint32>): Pointer<uint32> { return relay(value); }
export function run(): boolean {
  unsafecontext();
  let value: uint32 = 7;
  const original = addressof(value);
  const holder: Holder = { pointer: original };
  const alias = selected(holder);
  const view = reinterpretrawptr(torawptr(alias, word), word);
  if (view === undefined || !equalptr(original, view)) return false;
  storeptr(view, 9);
  if (value !== 9) return false;
  holder.pointer = allocateptr<uint32>(11);
  const replacement = reinterpretrawptr(torawptr(selected(holder), word), word);
  if (replacement === undefined || equalptr(original, replacement)) return false;
  storeptr(replacement, 13);
  return value === 9 && loadptr(alias) === 9 && loadptr(holder.pointer) === 13;
}
`;

const scopedSource = `
import { abi } from "test:abi";
import { allocateptr, equalptr, loadptr, memorylayout, reinterpretrawptr, storeptr,
  torawptr, unsafecontext } from "@tsonic/core/lang.js";
import type { Pointer, uint32 } from "@tsonic/core/types.js";
const word = memorylayout<uint32>({ datalayout: abi, bytesize: 4, bytealignment: 4, stride: 4, fields: [] });
function make(value: uint32): Pointer<uint32> { return allocateptr<uint32>(value); }
export function run(): boolean {
  unsafecontext();
  const first = make(17);
  const second = make(23);
  const left = reinterpretrawptr(torawptr(first, word), word);
  const right = reinterpretrawptr(torawptr(second, word), word);
  if (left === undefined || right === undefined || equalptr(left, right)) return false;
  storeptr(left, 29);
  return loadptr(first) === 29 && loadptr(second) === 23 && equalptr(first, left) && equalptr(second, right);
}
`;

const providerSource = `
import { create } from "test:records";
import type { Envelope } from "test:records";
import { addressof, loadptr, storeptr, equalptr, unsafecontext } from "@tsonic/core/lang.js";
export function run(): boolean {
  unsafecontext();
  let value: Envelope = create(1, 2, 7);
  const pointer = addressof(value);
  const saved = loadptr(pointer);
  const alias = addressof(value);
  const count = addressof(value.header.count);
  if (alias === undefined || count === undefined) return false;
  storeptr(count, 9);
  if (loadptr(pointer).header.count !== 9) return false;
  storeptr(alias, create(3, 4, 11));
  return saved.header.count === 7 && loadptr(count) === 11 &&
    loadptr(pointer).prefix === 3 && equalptr(pointer, alias);
}
`;

const higherOrderSource = `
import { abi } from "test:abi";
import { allocateptr, equalptr, loadptr, memorylayout, reinterpretrawptr, storeptr,
  torawptr, unsafecontext } from "@tsonic/core/lang.js";
import type { uint32 } from "@tsonic/core/types.js";
const word = memorylayout<uint32>({ datalayout: abi, bytesize: 4, bytealignment: 4, stride: 4, fields: [] });
function invoke<T>(factory: () => T): T { return factory(); }
export function run(): boolean {
  unsafecontext();
  const pointer = invoke(() => allocateptr<uint32>(7));
  const alias = reinterpretrawptr(torawptr(pointer, word), word);
  if (alias === undefined || !equalptr(pointer, alias)) return false;
  storeptr(alias, 11);
  return loadptr(pointer) === 11 && loadptr(alias) === 11;
}
`;

const logicalRawSource = `
import { abi } from "test:abi";
import { bindptr, memorylayout, torawptr } from "@tsonic/core/lang.js";
import type { uint32 } from "@tsonic/core/types.js";
const word = memorylayout<uint32>({ datalayout: abi, bytesize: 4, bytealignment: 4, stride: 4, fields: [] });
export function expose() {
  let value: uint32 = 7;
  const pointer = bindptr<uint32>({ identity: 1 }, () => value, next => { value = next; });
  return torawptr(pointer, word);
}
`;

const costProgram = `
using System.Runtime.CompilerServices;
using Tsonic.CSharp.Runtime;
if (!Tsonic.Generated.Index.run()) throw new System.Exception("cross-file pointer storage identity");
var pointer = NativeLocation.Allocate<uint>(7, NativeLayout.Scalar<uint>(4, 4, 64, true));
for (var warm = 0; warm < 100; warm++) { MeasureGenerated(pointer); MeasureHandwritten(pointer); }
var generated = MeasureGenerated(pointer);
var handwritten = MeasureHandwritten(pointer);
if (generated != handwritten || generated != 0) throw new System.Exception($"forward allocation {generated}/{handwritten}");
[MethodImpl(MethodImplOptions.NoInlining)]
static long MeasureGenerated(Location<uint> pointer) {
  var before = System.GC.GetAllocatedBytesForCurrentThread();
  for (var index = 0; index < 10000; index++) pointer = Tsonic.Generated.Index.forward(pointer);
  var bytes = System.GC.GetAllocatedBytesForCurrentThread() - before;
  System.GC.KeepAlive(pointer);
  return bytes;
}
[MethodImpl(MethodImplOptions.NoInlining)]
static long MeasureHandwritten(Location<uint> pointer) {
  var before = System.GC.GetAllocatedBytesForCurrentThread();
  for (var index = 0; index < 10000; index++) pointer = Forward(pointer);
  var bytes = System.GC.GetAllocatedBytesForCurrentThread() - before;
  System.GC.KeepAlive(pointer);
  return bytes;
}
[MethodImpl(MethodImplOptions.NoInlining)]
static Location<uint> Forward(Location<uint> pointer) => pointer;
`;

for (const surface of ["native", "js"]) {
  test(`pointer argument consumers retain cross-file aliases and zero-cost forwarding (${surface})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ sourceText: argumentSource, surface,
      files: { "relay.ts": relaySource }, capabilities: [memoryAbiCapability("csharp")] });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `pointer-storage-arguments-${surface}`, false, true, [], costProgram);
  });

  test(`one pointer producer AST retains distinct invocation storage (${surface})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ sourceText: scopedSource, surface,
      capabilities: [memoryAbiCapability("csharp")] });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `pointer-storage-invocations-${surface}`, false, true);
  });

  test(`provider nested field addresses retain replacement and two-address identity (${surface})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ sourceText: providerSource, surface,
      capabilities: [nativeRecordProvider()] });
    assertCsharpCompilationSucceeded(compiled);
    const native = { ...compiled, artifacts: new Map([...compiled.artifacts,
      ["Provider.cs", readFileSync(new URL("../../fixtures/native-memory/Provider.cs", import.meta.url), "utf8")]]) };
    executeCsharpConstruction(native, `pointer-storage-provider-field-${surface}`, false, true);
  });
}

for (const surface of ["native", "js"]) {
  test(`higher-order factory pointer domains complete after source checking (${surface})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ sourceText: higherOrderSource, surface,
      capabilities: [memoryAbiCapability("csharp")] });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `pointer-storage-higher-order-${surface}`, false, true);
  });

  test(`logical pointer domains do not acquire physical raw backing (${surface})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ sourceText: logicalRawSource, surface,
      capabilities: [memoryAbiCapability("csharp")] });
    assertCsharpCheckingSucceeded(compiled);
    const diagnostics = compiled.result.diagnostics.map(issue => {
      const range = issue.sourceNode === undefined ? undefined : compiled.source.ast.authoredRange(issue.sourceNode);
      return { code: issue.code, message: issue.message,
        text: range?.kind === "authored" ? logicalRawSource.slice(range.start, range.end) : undefined };
    });
    assert.deepEqual(diagnostics, [{ code: "CSHARP_POINTER_BACKING_NOT_PROVEN",
      message: "Physical pointer backing requires an allocation, address or reinterpretation, not a logical pointer.",
      text: "torawptr(pointer, word)" }]);
    assert.equal(compiled.artifacts.size, 0);
  });
}
