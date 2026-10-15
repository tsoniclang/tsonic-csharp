import assert from "node:assert/strict";
import test from "node:test";
import {
  assertCsharpCompilationSucceeded,
  assertCsharpCheckingSucceeded,
  compileCsharpSource,
} from "../../../helpers/direct-csharp-session.mjs";
import { memoryAbiCapability } from "../../../helpers/memory-abi.mjs";

const prelude = `
import { abi } from "test:abi";
import { memorylayout, memoryarraylayout, memoryfield, struct, field,
  allocateptr, torawptr, reinterpretrawptr, unsafecontext,
  sizeof, alignof, strideof } from "@tsonic/core/lang.js";
import type { FixedArray, RawPointer, uint32, nativeUint } from "@tsonic/core/types.js";
const word = memorylayout<uint32>({ datalayout: abi, bytesize: 4, bytealignment: 4, stride: 4, fields: [] });
const pair = memoryarraylayout<uint32, 2>({ datalayout: abi, bytesize: 8, bytealignment: 4, stride: 8, elementlayout: word, length: 2 });
`;

test("fixed-array layout observations erase without requiring inline C# storage", () => {
  const compiled = compileCsharpSource({ capabilities: [memoryAbiCapability("csharp")], files: {
    "arrays.ts": `import type { FixedArray } from "@tsonic/core/types.js";
      export type Huge = FixedArray<{}, 9007199254740993n>;`,
  }, sourceText: `${prelude}
  import type { Huge } from "./arrays.js";
import type { MemoryLayout } from "@tsonic/core/types.js";
const matrix = memoryarraylayout<FixedArray<uint32, 2>, 2>({ datalayout: abi, bytesize: 16, bytealignment: 4, stride: 16, elementlayout: pair, length: 2 });
const empty = memorylayout<{}>({ datalayout: abi, bytesize: 0, bytealignment: 1, stride: 0, fields: [] });
const huge = memoryarraylayout<{}, 9007199254740993n>({ datalayout: abi, bytesize: 0, bytealignment: 1, stride: 0, elementlayout: empty, length: 9007199254740993n });
const annotated: MemoryLayout<Huge> = huge;
export function pairSize(): nativeUint { return sizeof(pair); }
export function matrixSize(): nativeUint { return sizeof(matrix); }
export function matrixAlignment(): nativeUint { return alignof(matrix); }
export function matrixStride(): nativeUint { return strideof(matrix); }
export function hugeSize(): nativeUint { return sizeof(huge); }
export function aliasedHugeSize(): nativeUint { return sizeof(annotated); }
export function inlineHugeSize(): nativeUint {
  return sizeof(memoryarraylayout({ datalayout: abi, bytesize: 0, bytealignment: 1, stride: 0, elementlayout: empty, length: 9007199254740993n }));
}
` });
  assertCsharpCompilationSucceeded(compiled);
  const output = compiled.artifacts.get("src/Index.cs");
  for (const [name, value] of [["pairSize", 8], ["matrixSize", 16], ["matrixAlignment", 4],
    ["matrixStride", 16], ["hugeSize", 0], ["aliasedHugeSize", 0], ["inlineHugeSize", 0]]) {
    assert.match(output, new RegExp(`public static nuint ${name}\\(\\)\\s*\\{\\s*return ${value};\\s*\\}`, "u"));
  }
  const generated = [...compiled.artifacts].filter(([path]) => path.endsWith(".cs")).map(([, text]) => text).join("\n");
  assert.doesNotMatch(generated, /memoryarraylayout|MemoryLayout|9007199254740993|NativeLocation|\[\]/u);
});

for (const [name, declarations, sourceType, layout] of [
  ["root array", "", "FixedArray<uint32, 2>", "pair"],
  ["array of arrays", `
    const matrix = memoryarraylayout<FixedArray<uint32, 2>, 2>({ datalayout: abi, bytesize: 16, bytealignment: 4, stride: 16, elementlayout: pair, length: 2 });
  `, "FixedArray<FixedArray<uint32, 2>, 2>", "matrix"],
  ["record field array", `
    const Record = struct({ values: field<FixedArray<uint32, 2>>() });
    const record = memorylayout<typeof Record>({
      datalayout: abi, bytesize: 8, bytealignment: 4, stride: 8,
      fields: [memoryfield({ select: (value: typeof Record) => value.values, byteoffset: 0, bytealignment: 4, fieldlayout: pair })],
    });
  `, "typeof Record", "record"],
  ["array nested through records", `
    const Record = struct({ values: field<FixedArray<uint32, 2>>() });
    const Envelope = struct({ record: field<typeof Record>() });
    const record = memorylayout<typeof Record>({
      datalayout: abi, bytesize: 8, bytealignment: 4, stride: 8,
      fields: [memoryfield({ select: (value: typeof Record) => value.values, byteoffset: 0, bytealignment: 4, fieldlayout: pair })],
    });
    const envelope = memorylayout<typeof Envelope>({
      datalayout: abi, bytesize: 8, bytealignment: 4, stride: 8,
      fields: [memoryfield({ select: (value: typeof Envelope) => value.record, byteoffset: 0, bytealignment: 4, fieldlayout: record })],
    });
  `, "typeof Envelope", "envelope"],
]) {
  test(`native raw reinterpretation constructs exact codecs for ${name}`, () => {
    const compiled = compileCsharpSource({ capabilities: [memoryAbiCapability("csharp")], sourceText: `${prelude}
${declarations}
export function expose(raw: RawPointer | undefined) {
  unsafecontext();
  return reinterpretrawptr(raw, ${layout});
}
` });
    assertCsharpCompilationSucceeded(compiled);
    assert.match(compiled.artifacts.get("src/Index.cs"), /NativeLayout[\s\S]*for \(/u);
  });

  test(`native physical backing constructs exact codecs for ${name}`, () => {
    const compiled = compileCsharpSource({ capabilities: [memoryAbiCapability("csharp")], sourceText: `${prelude}
${declarations}
export function expose(value: ${sourceType}) {
  const pointer = allocateptr<${sourceType}>(value);
  return torawptr(pointer, ${layout});
}
` });
    assertCsharpCompilationSucceeded(compiled);
    assert.match(compiled.artifacts.get("src/Index.cs"), /NativeLayout[\s\S]*for \(/u);
  });
}

test("native array layouts reject reference elements rather than decoding object identities", () => {
  const compiled = compileCsharpSource({ capabilities: [memoryAbiCapability("csharp")], sourceText: `${prelude}
interface Entry { count: uint32 }
const entry = memorylayout<Entry>({
  datalayout: abi, bytesize: 4, bytealignment: 4, stride: 4,
  fields: [memoryfield({ select: (value: Entry) => value.count, byteoffset: 0, bytealignment: 4, fieldlayout: word })],
});
const entries = memoryarraylayout<Entry, 2>({ datalayout: abi, bytesize: 8, bytealignment: 4, stride: 8, elementlayout: entry, length: 2 });
export function expose(raw: RawPointer | undefined) {
  unsafecontext();
  return reinterpretrawptr(raw, entries);
}
` });
  assertCsharpCheckingSucceeded(compiled);
  assert.ok(compiled.result.diagnostics.some(item => item.message.includes("all-bit-pattern")),
    JSON.stringify(compiled.result.diagnostics));
  assert.equal(compiled.artifacts.size, 0);
});

test("fixed-array codec identity includes exact count, stride and element layout", async () => {
  const { csharpNativeMemoryLayoutsEqual } = await import("../../../../dist/target-model/operations/native-memory.js");
  const scalar = { kind: "scalar", pointeeType: { kind: "source-primitive", name: "uint32" },
    size: 4, alignment: 4, width: 64, littleEndian: true, fields: [] };
  const array = { kind: "array", pointeeType: { kind: "array", element: scalar.pointeeType },
    size: 16, alignment: 4, width: 64, littleEndian: true, length: "2", stride: 8, element: scalar };
  assert.equal(csharpNativeMemoryLayoutsEqual(array, structuredClone(array)), true);
  for (const change of [{ length: "3" }, { stride: 4 }, { element: { ...scalar, size: 8 } },
    { element: { ...scalar, pointeeType: { kind: "source-primitive", name: "int32" } } }]) {
    assert.equal(csharpNativeMemoryLayoutsEqual(array, { ...array, ...change }), false);
  }
});
