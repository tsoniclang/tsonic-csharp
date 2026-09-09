import assert from "node:assert/strict";
import test from "node:test";
import {
  assertCsharpCheckingSucceeded,
  assertCsharpCompilationSucceeded,
  compileCsharpSource,
} from "../../../helpers/direct-csharp-session.mjs";
import { memoryAbiCapability } from "../../../helpers/memory-abi.mjs";

const prelude = `
import { abi } from "test:abi";
import { memoryLayout, memoryArrayLayout, memoryField, struct, field,
  allocatePointer, toRawPointer, reinterpretRawPointer, unsafeContext,
  sizeOf, alignOf, strideOf } from "@tsonic/core/lang.js";
import type { FixedArray, RawPointer, uint32, nativeUint } from "@tsonic/core/types.js";
const word = memoryLayout<uint32>(abi, 4, 4, 4);
const pair = memoryArrayLayout<uint32, 2>(abi, 8, 4, 8, word, 2);
`;

test("fixed-array layout observations erase without requiring inline C# storage", () => {
  const compiled = compileCsharpSource({ capabilities: [memoryAbiCapability("csharp")], files: {
    "arrays.ts": `import type { FixedArray } from "@tsonic/core/types.js";
      export type Huge = FixedArray<{}, 9007199254740993n>;`,
  }, sourceText: `${prelude}
  import type { Huge } from "./arrays.js";
import type { MemoryLayout } from "@tsonic/core/types.js";
const matrix = memoryArrayLayout<FixedArray<uint32, 2>, 2>(abi, 16, 4, 16, pair, 2);
const empty = memoryLayout<{}>(abi, 0, 1, 0);
const huge = memoryArrayLayout<{}, 9007199254740993n>(abi, 0, 1, 0, empty, 9007199254740993n);
const annotated: MemoryLayout<Huge> = huge;
export function pairSize(): nativeUint { return sizeOf(pair); }
export function matrixSize(): nativeUint { return sizeOf(matrix); }
export function matrixAlignment(): nativeUint { return alignOf(matrix); }
export function matrixStride(): nativeUint { return strideOf(matrix); }
export function hugeSize(): nativeUint { return sizeOf(huge); }
export function aliasedHugeSize(): nativeUint { return sizeOf(annotated); }
export function inlineHugeSize(): nativeUint {
  return sizeOf(memoryArrayLayout(abi, 0, 1, 0, empty, 9007199254740993n));
}
` });
  assertCsharpCompilationSucceeded(compiled);
  const output = compiled.artifacts.get("src/Index.cs");
  for (const [name, value] of [["pairSize", 8], ["matrixSize", 16], ["matrixAlignment", 4],
    ["matrixStride", 16], ["hugeSize", 0], ["aliasedHugeSize", 0], ["inlineHugeSize", 0]]) {
    assert.match(output, new RegExp(`public static nuint ${name}\\(\\)\\s*\\{\\s*return ${value};\\s*\\}`, "u"));
  }
  const generated = [...compiled.artifacts].filter(([path]) => path.endsWith(".cs")).map(([, text]) => text).join("\n");
  assert.doesNotMatch(generated, /memoryArrayLayout|MemoryLayout|9007199254740993|NativeLocation|\[\]/u);
});

for (const [name, declarations, sourceType, layout] of [
  ["root array", "", "FixedArray<uint32, 2>", "pair"],
  ["array of arrays", `
    const matrix = memoryArrayLayout<FixedArray<uint32, 2>, 2>(abi, 16, 4, 16, pair, 2);
  `, "FixedArray<FixedArray<uint32, 2>, 2>", "matrix"],
  ["record field array", `
    const Record = struct({ values: field<FixedArray<uint32, 2>>() });
    const record = memoryLayout<typeof Record>(abi, 8, 4, 8,
      memoryField((value: typeof Record) => value.values, 0, 4, pair));
  `, "typeof Record", "record"],
  ["array nested through records", `
    const Record = struct({ values: field<FixedArray<uint32, 2>>() });
    const Envelope = struct({ record: field<typeof Record>() });
    const record = memoryLayout<typeof Record>(abi, 8, 4, 8,
      memoryField((value: typeof Record) => value.values, 0, 4, pair));
    const envelope = memoryLayout<typeof Envelope>(abi, 8, 4, 8,
      memoryField((value: typeof Envelope) => value.record, 0, 4, record));
  `, "typeof Envelope", "envelope"],
]) {
  test(`native raw reinterpretation precisely rejects ${name}`, () => {
    const compiled = compileCsharpSource({ capabilities: [memoryAbiCapability("csharp")], sourceText: `${prelude}
${declarations}
export function expose(raw: RawPointer | undefined) {
  unsafeContext();
  return reinterpretRawPointer(raw, ${layout});
}
` });
    assertInlineArrayRejection(compiled, "CSHARP_NATIVE_POINTER_OPERATION_NOT_MAPPED");
  });

  test(`native physical backing precisely rejects ${name}`, () => {
    const compiled = compileCsharpSource({ capabilities: [memoryAbiCapability("csharp")], sourceText: `${prelude}
${declarations}
export function expose(value: ${sourceType}) {
  const pointer = allocatePointer<${sourceType}>(value);
  return toRawPointer(pointer, ${layout});
}
` });
    assertInlineArrayRejection(compiled, "CSHARP_NATIVE_BACKING_NOT_PROVEN");
  });
}

function assertInlineArrayRejection(compiled, code) {
  assertCsharpCheckingSucceeded(compiled);
  const diagnostic = compiled.targetDiagnostics.find(item => item.code === code);
  assert.ok(diagnostic, JSON.stringify(compiled.targetDiagnostics, null, 2));
  assert.match(diagnostic.message, /does not support inline fixed-array native memory layouts/u);
  assert.match(diagnostic.message, /ordinary T\[\] carriers do not provide inline storage/u);
  assert.equal(compiled.artifacts.size, 0);
}
