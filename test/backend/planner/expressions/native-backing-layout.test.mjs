import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCheckingSucceeded, compileCsharpSource } from "../../../helpers/direct-csharp-session.mjs";
import { memoryAbiCapability } from "../../../helpers/memory-abi.mjs";

const sourceText = "import { abi } from \"test:abi\";\nimport { addressof, memorylayout, torawptr } from \"@tsonic/core/lang.js\";\nimport type { uint32 } from \"@tsonic/core/types.js\";\n\nconst word = memorylayout<uint32>({\n  datalayout: abi,\n  bytesize: 4,\n  bytealignment: 4,\n  stride: 8,\n  fields: [],\n});\n\nexport function expose() {\n  const values: uint32[] = [7, 8];\n  const pointer = addressof(values[0]);\n  return torawptr(pointer, word);\n}\n";

test("native array backing rejects the original stride-eight raw-use descriptor", () => {
  const compiled = compileCsharpSource({ sourceText, capabilities: [memoryAbiCapability("csharp")] });
  assertCsharpCheckingSucceeded(compiled);
  const diagnostics = compiled.result.diagnostics.map(issue => {
    const range = issue.sourceNode === undefined ? undefined : compiled.source.ast.authoredRange(issue.sourceNode);
    const start = range?.kind === "authored" ? range.start : undefined;
    const end = range?.kind === "authored" ? range.end : undefined;
    return { code: issue.code, message: issue.message, start, end,
      text: start === undefined || end === undefined ? undefined : sourceText.slice(start, end) };
  });
  assert.deepEqual(diagnostics, [
    {
      "code": "CSHARP_NATIVE_BACKING_NOT_PROVEN",
      "message": "The raw-use descriptor does not equal the storage's declared native layout.",
      "start": 393,
      "end": 416,
      "text": "torawptr(pointer, word)"
    }
  ]);
  assert.equal(compiled.artifacts.size, 0);
});


test("declared native struct backing rejects original-packed9 raw-use layout", () => {
  const sourceText = "\nimport { abi } from \"test:abi\";\nimport { struct, field, defaultvalue, memorylayout, memoryfield, allocateptr,\n  torawptr, reinterpretrawptr, loadptr, storeptr, offsetrawptr,\n  equalptr, unsafecontext } from \"@tsonic/core/lang.js\";\nimport type { uint8, uint32 } from \"@tsonic/core/types.js\";\nconst Header = struct({ tag: field<uint8>(), count: field<uint32>() });\nconst Envelope = struct({ prefix: field<uint8>(), header: field<typeof Header>() });\nconst byte = memorylayout<uint8>({ datalayout: abi, bytesize: 1, bytealignment: 1, stride: 1, fields: [] });\nconst word = memorylayout<uint32>({ datalayout: abi, bytesize: 4, bytealignment: 4, stride: 4, fields: [] });\nconst packedWord = memorylayout<uint32>({ datalayout: abi, bytesize: 4, bytealignment: 1, stride: 4, fields: [] });\nconst header = memorylayout<typeof Header>({ datalayout: abi, bytesize: 8, bytealignment: 4, stride: 8, fields: [\n  memoryfield({ select: (value: typeof Header) => value.tag, byteoffset: 0, bytealignment: 1, fieldlayout: byte }),\n  memoryfield({ select: (value: typeof Header) => value.count, byteoffset: 4, bytealignment: 4, fieldlayout: word })] });\nconst envelope = memorylayout<typeof Envelope>({ datalayout: abi, bytesize: 9, bytealignment: 1, stride: 9, fields: [\n  memoryfield({ select: (value: typeof Envelope) => value.prefix, byteoffset: 0, bytealignment: 1, fieldlayout: byte }),\n  memoryfield({ select: (value: typeof Envelope) => value.header, byteoffset: 1, bytealignment: 1, fieldlayout: header })] });\nexport function expose() {\n  unsafecontext();\n  const value: typeof Envelope = defaultvalue<typeof Envelope>();\n  const pointer = allocateptr<typeof Envelope>(value);\n  return torawptr(pointer, envelope);\n}\n";
  const compiled = compileCsharpSource({ sourceText, files: {}, capabilities: [memoryAbiCapability("csharp")] });
  assertCsharpCheckingSucceeded(compiled);
  const diagnostics = compiled.result.diagnostics.map(issue => {
    const range = issue.sourceNode === undefined ? undefined : compiled.source.ast.authoredRange(issue.sourceNode);
    const start = range?.kind === "authored" ? range.start : undefined;
    const end = range?.kind === "authored" ? range.end : undefined;
    return { code: issue.code, message: issue.message, start, end,
      text: start === undefined || end === undefined ? undefined : sourceText.slice(start, end) };
  });
  assert.deepEqual(diagnostics, [
  {
    "code": "CSHARP_NATIVE_BACKING_NOT_PROVEN",
    "message": "The raw-use descriptor does not equal the storage's declared native layout.",
    "start": 1678,
    "end": 1705,
    "text": "torawptr(pointer, envelope)"
  }
]);
  assert.equal(compiled.artifacts.size, 0);
});

test("declared native struct backing rejects original-fixed36 raw-use layout", () => {
  const sourceText = "import { allocateptr, torawptr, unsafecontext } from \"@tsonic/core/lang.js\";\nimport { header } from \"./layout.js\";\nimport type { Header } from \"./layout.js\";\nexport function expose() {\n  unsafecontext();\n  const value: Header = { tag: 7, values: [[1, 2], [3, 4]] as const };\n  const pointer = allocateptr<Header>(value);\n  return torawptr(pointer, header);\n}\n";
  const compiled = compileCsharpSource({ sourceText, files: {"layout.ts":"\nimport { field, memoryarraylayout, memoryfield, memorylayout, struct } from \"@tsonic/core/lang.js\";\nimport type { FixedArray, uint8, uint32 } from \"@tsonic/core/types.js\";\nimport { abi } from \"test:abi\";\nexport type Row = FixedArray<uint32, 2>;\nexport type Matrix = FixedArray<Row, 2>;\nexport const Header = struct({ tag: field<uint8>(), values: field<Matrix>() });\nexport type Header = typeof Header;\nexport const word = memorylayout<uint32>({ datalayout: abi, bytesize: 4, bytealignment: 4, stride: 8, fields: [] });\nconst byte = memorylayout<uint8>({ datalayout: abi, bytesize: 1, bytealignment: 1, stride: 1, fields: [] });\nexport const row = memoryarraylayout<uint32, 2>({ datalayout: abi, bytesize: 16, bytealignment: 4, stride: 16, elementlayout: word, length: 2 });\nconst matrix = memoryarraylayout<Row, 2>({ datalayout: abi, bytesize: 32, bytealignment: 4, stride: 32, elementlayout: row, length: 2 });\nexport const header = memorylayout<Header>({\n  datalayout: abi,\n  bytesize: 36,\n  bytealignment: 4,\n  stride: 36,\n  fields: [\n    memoryfield({ select: (value: Header) => value.tag, byteoffset: 0, bytealignment: 1, fieldlayout: byte }),\n    memoryfield({ select: (value: Header) => value.values, byteoffset: 4, bytealignment: 4, fieldlayout: matrix }),\n  ],\n});\nconst emptyword = memorylayout<uint32>({ datalayout: abi, bytesize: 4, bytealignment: 4, stride: 4, fields: [] });\nexport const empty = memoryarraylayout<uint32, 0>({ datalayout: abi, bytesize: 0, bytealignment: 4, stride: 0, elementlayout: emptyword, length: 0 });\n"}, capabilities: [memoryAbiCapability("csharp")] });
  assertCsharpCheckingSucceeded(compiled);
  const diagnostics = compiled.result.diagnostics.map(issue => {
    const range = issue.sourceNode === undefined ? undefined : compiled.source.ast.authoredRange(issue.sourceNode);
    const start = range?.kind === "authored" ? range.start : undefined;
    const end = range?.kind === "authored" ? range.end : undefined;
    return { code: issue.code, message: issue.message, start, end,
      text: start === undefined || end === undefined ? undefined : sourceText.slice(start, end) };
  });
  assert.deepEqual(diagnostics, [
  {
    "code": "CSHARP_NATIVE_BACKING_NOT_PROVEN",
    "message": "The raw-use descriptor does not equal the storage's declared native layout.",
    "start": 330,
    "end": 355,
    "text": "torawptr(pointer, header)"
  }
]);
  assert.equal(compiled.artifacts.size, 0);
});

test("declared native struct backing rejects original-reordered-header raw-use layout", () => {
  const sourceText = "import { allocateptr, torawptr, unsafecontext } from \"@tsonic/core/lang.js\";\nimport { header } from \"./layout.js\";\nimport type { Header } from \"./layout.js\";\nexport function expose() {\n  unsafecontext();\n  const value: Header = { tag: 7, word: { count: 9 } };\n  const pointer = allocateptr<Header>(value);\n  return torawptr(pointer, header);\n}\n";
  const compiled = compileCsharpSource({ sourceText, files: {"layout.ts":"\nimport { field, memoryfield, memorylayout, struct } from \"@tsonic/core/lang.js\";\nimport type { uint8, uint32 } from \"@tsonic/core/types.js\";\nimport { abi } from \"test:abi\";\nexport const Word = struct({ count: field<uint32>() });\nexport type Word = typeof Word;\nexport const Header = struct({ word: field<Word>(), tag: field<uint8>() });\nexport type Header = typeof Header;\nexport const word = memorylayout<uint32>({ datalayout: abi, bytesize: 4, bytealignment: 4, stride: 4, fields: [] });\nconst byte = memorylayout<uint8>({ datalayout: abi, bytesize: 1, bytealignment: 1, stride: 1, fields: [] });\nconst nested = memorylayout<Word>({\n  datalayout: abi,\n  bytesize: 4,\n  bytealignment: 4,\n  stride: 4,\n  fields: [memoryfield({ select: (value: Word) => value.count, byteoffset: 0, bytealignment: 4, fieldlayout: word })],\n});\nexport const header = memorylayout<Header>({\n  datalayout: abi,\n  bytesize: 8,\n  bytealignment: 4,\n  stride: 8,\n  fields: [\n    memoryfield({ select: (value: Header) => value.tag, byteoffset: 0, bytealignment: 1, fieldlayout: byte }),\n    memoryfield({ select: (value: Header) => value.word, byteoffset: 4, bytealignment: 4, fieldlayout: nested }),\n  ],\n});\n"}, capabilities: [memoryAbiCapability("csharp")] });
  assertCsharpCheckingSucceeded(compiled);
  const diagnostics = compiled.result.diagnostics.map(issue => {
    const range = issue.sourceNode === undefined ? undefined : compiled.source.ast.authoredRange(issue.sourceNode);
    const start = range?.kind === "authored" ? range.start : undefined;
    const end = range?.kind === "authored" ? range.end : undefined;
    return { code: issue.code, message: issue.message, start, end,
      text: start === undefined || end === undefined ? undefined : sourceText.slice(start, end) };
  });
  assert.deepEqual(diagnostics, [
  {
    "code": "CSHARP_NATIVE_BACKING_NOT_PROVEN",
    "message": "The raw-use descriptor does not equal the storage's declared native layout.",
    "start": 315,
    "end": 340,
    "text": "torawptr(pointer, header)"
  }
]);
  assert.equal(compiled.artifacts.size, 0);
});
