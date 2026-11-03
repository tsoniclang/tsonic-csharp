import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCheckingSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { memoryAbiCapability } from "../../helpers/memory-abi.mjs";

const recordPrelude = `
import { abi } from "test:abi";
import type { Pointer, RawPointer, FixedArray, int32, uint32, int64, uint64, uint8 } from "@tsonic/core/types.js";
import { struct, field, memorylayout, memoryarraylayout, memoryfield, fieldoffsetof,
  allocateptr, torawptr, reinterpretrawptr, bindmemoryfield, bindmemoryrecord } from "@tsonic/core/lang.js";
`;

const prelude = `
import { abi } from "test:abi";
import type { Pointer, RawPointer, uint32, int32 } from "@tsonic/core/types.js";
import { memorylayout, memoryfield, sizeof, allocateptr, torawptr, reinterpretrawptr } from "@tsonic/core/lang.js";
`;

const arrayTestPrelude = `
import { abi } from "test:abi";
import type { FixedArray, MemoryLayout, Pointer, RawPointer, uint8, uint32, int32,
  uint64, nativeUint } from "@tsonic/core/types.js";
import { memorylayout, memoryarraylayout, memoryfield, sizeof, alignof, strideof,
  fieldoffsetof, torawptr, reinterpretrawptr, allocateptr, addressof,
  offsetrawptr, keepalive } from "@tsonic/core/lang.js";
declare const raw: RawPointer | undefined;
const word = memorylayout<uint32>({ datalayout: abi, bytesize: 4, bytealignment: 4, stride: 4, fields: [] });
interface Empty {}
const empty = memorylayout<Empty>({ datalayout: abi, bytesize: 0, bytealignment: 4, stride: 0, fields: [] });
`;

const bindingPrelude = `
import { abi } from "test:abi";
import type { Pointer, RawPointer, uint32, int32, FixedArray } from "@tsonic/core/types.js";
import { memorylayout, memoryfield, memoryarraylayout, bindmemoryfield, bindmemoryrecord,
  allocateptr, addressof, viewptr, projectptr, loadptr, storeptr,
  torawptr, reinterpretrawptr, equalptr } from "@tsonic/core/lang.js";
const word = memorylayout<uint32>({ datalayout: abi, bytesize: 4, bytealignment: 4, stride: 4, fields: [] });
interface Header { count: uint32; tag: uint32 }
const countField = memoryfield({ select: (value: Header) => value.count, byteoffset: 0, bytealignment: 4, fieldlayout: word });
const tagField = memoryfield({ select: (value: Header) => value.tag, byteoffset: 4, bytealignment: 4, fieldlayout: word });
const headerLayout = memorylayout<Header>({ datalayout: abi, bytesize: 8, bytealignment: 4, stride: 8, fields: [countField, tagField] });
`;

const cases = [];
for (const [signed, unsigned, size] of [["int32", "uint32", 4], ["int64", "uint64", 8]]) {
  cases.push({ family: "closed-record raw view",
    name: `checker-equal ${signed}/${unsigned} records cannot share raw storage`,
    sourceText: recordPrelude + `
      interface Signed { count: ${signed} }
      interface Unsigned { count: ${unsigned} }
      const word = memorylayout<${signed}>({ datalayout: abi, bytesize: ${size}, bytealignment: ${size}, stride: ${size}, fields: [] });
      const layout = memorylayout<Signed>({
        datalayout: abi,
        bytesize: ${size},
        bytealignment: ${size},
        stride: ${size},
        fields: [memoryfield({ select: (value: Signed) => value.count, byteoffset: 0, bytealignment: ${size}, fieldlayout: word })],
      });
      declare const pointer: Pointer<Unsigned>;
      torawptr(pointer, layout);
    ` });
}

for (const [name, setup, expression] of [
  ["numeric array index", "const values: Pointer<uint32>[] = [allocateptr<uint32>(3)];", "values[0]"],
  ["shorthand field", "const pointer = allocateptr<uint32>(3); const holder = { pointer };", "holder.pointer"],
  ["conditional mutable binding", "let pointer = allocateptr<uint32>(3); pointer = allocateptr<uint32>(4);", "true ? pointer : undefined"],
  ["inferred default return", "function get(value: Pointer<uint32> = allocateptr<uint32>(3)) { return value; }", "get()"],
  ["generic return", "function identity<Value>(value: Pointer<Value>): Pointer<Value> { return value; }", "identity(allocateptr<uint32>(3))"],
]) {
  cases.push({ family: "cross-file pointee type",
    name: `${name} preserves the pointee domain and rejects signed layout substitution`,
    sourceText: prelude + `
        const layout = memorylayout<int32>({ datalayout: abi, bytesize: 4, bytealignment: 4, stride: 4, fields: [] });
        ${setup} torawptr(${expression}, layout);
      ` });
}

for (const operation of ["reinterpret", "to-raw"]) {
  cases.push({ family: "cross-file reinterpret",
    name: `${operation} rejects a distinct primitive domain despite equal number carriers`,
    sourceText: prelude + `
      const signed = memorylayout<int32>({ datalayout: abi, bytesize: 4, bytealignment: 4, stride: 4, fields: [] });
      declare const raw: RawPointer | undefined;
      declare const unsigned: Pointer<uint32>;
      interface Header { value: uint32 }
      ${operation === "reinterpret" ? "reinterpretrawptr<uint32>(raw, signed);"
        : "torawptr(unsigned, signed);"}
    ` });
}

const sharedTypes = `
import type { FixedArray, uint32 } from "@tsonic/core/types.js";
export type Pair = FixedArray<uint32, 2>;
export type Matrix = FixedArray<Pair, 2>;
export interface Entry { first: uint32; second: uint32 }
export type Entries = FixedArray<Entry, 2>;
export interface Holder { items: Pair }
export interface EmptyValue {}
`;

cases.push({ family: "fixed-array cross-file",
  name: "an imported same-carrier signed array cannot replace an unsigned pointer pointee",
  sourceText: arrayTestPrelude + `
    import type { Pair } from "./types.js";
    import { layout } from "./layout.js";
    declare const value: Pair;
    const pointer = allocateptr<Pair>(value);
    torawptr(pointer, layout);
    reinterpretrawptr<Pair>(raw, layout);
    sizeof(layout);
  `,
  files: {
    "/src/types.ts": sharedTypes,
    "/src/layout.ts": arrayTestPrelude + `
      const signed = memorylayout<int32>({ datalayout: abi, bytesize: 4, bytealignment: 4, stride: 4, fields: [] });
      export const layout = memoryarraylayout<int32, 2>({ datalayout: abi, bytesize: 8, bytealignment: 4, stride: 8, elementlayout: signed, length: 2 });
    `,
  } });

cases.push({ family: "fixed-array observations",
  name: "raw array conversion rejects a different primitive pointee despite identical carrier and total dimensions",
  sourceText: arrayTestPrelude + `
    const signed = memorylayout<int32>({ datalayout: abi, bytesize: 4, bytealignment: 4, stride: 4, fields: [] });
    const array = memoryarraylayout({ datalayout: abi, bytesize: 8, bytealignment: 4, stride: 8, elementlayout: signed, length: 2 });
    declare const pointer: Pointer<FixedArray<uint32, 2>>;
    torawptr(pointer, array);
    reinterpretrawptr<FixedArray<uint32, 2>>(raw, array);
    sizeof(array);
  ` });

cases.push({ family: "signed-vs-unsigned field binding",
  name: "memory bindings reject signed instead of unsigned field",
  sourceText: bindingPrelude + `
    const pointer = allocateptr<int32>(3);
    bindmemoryfield(countField, pointer);
  ` });

export const phaseCases = Object.freeze(cases);

const expectedDiagnostics = {
  "checker-equal int32/uint32 records cannot share raw storage": [
    {
      "code": "CSHARP_POINTER_BACKING_NOT_PROVEN",
      "message": "Physical pointer backing requires a closed source storage domain (external-input).",
      "text": "pointer: Pointer<Unsigned>",
      "file": "/src/index.ts"
    },
    {
      "code": "CSHARP_NATIVE_POINTER_OPERATION_NOT_MAPPED",
      "message": "C# native-pointer 'raw-location' is not mapped: The selected layout has no closed all-bit-pattern C# native value representation.",
      "text": "torawptr(pointer, layout)",
      "file": "/src/index.ts"
    }
  ],
  "checker-equal int64/uint64 records cannot share raw storage": [
    {
      "code": "CSHARP_POINTER_BACKING_NOT_PROVEN",
      "message": "Physical pointer backing requires a closed source storage domain (external-input).",
      "text": "pointer: Pointer<Unsigned>",
      "file": "/src/index.ts"
    },
    {
      "code": "CSHARP_NATIVE_POINTER_OPERATION_NOT_MAPPED",
      "message": "C# native-pointer 'raw-location' is not mapped: The selected layout has no closed all-bit-pattern C# native value representation.",
      "text": "torawptr(pointer, layout)",
      "file": "/src/index.ts"
    }
  ],
  "numeric array index preserves the pointee domain and rejects signed layout substitution": [
    {
      "code": "CSHARP_NATIVE_POINTER_OPERATION_NOT_MAPPED",
      "message": "C# native-pointer 'raw-location' is not mapped: The typed location and selected memory layout have different C# pointee representations.",
      "text": "torawptr(values[0], layout)",
      "file": "/src/index.ts"
    },
    {
      "code": "CSHARP_NATIVE_BACKING_NOT_PROVEN",
      "message": "The physical storage origin and layout have different exact native value types.",
      "text": "allocateptr<uint32>(3)",
      "file": "/src/index.ts"
    }
  ],
  "shorthand field preserves the pointee domain and rejects signed layout substitution": [
    {
      "code": "CSHARP_NATIVE_POINTER_OPERATION_NOT_MAPPED",
      "message": "C# native-pointer 'raw-location' is not mapped: The typed location and selected memory layout have different C# pointee representations.",
      "text": "torawptr(holder.pointer, layout)",
      "file": "/src/index.ts"
    },
    {
      "code": "CSHARP_NATIVE_BACKING_NOT_PROVEN",
      "message": "The physical storage origin and layout have different exact native value types.",
      "text": "allocateptr<uint32>(3)",
      "file": "/src/index.ts"
    }
  ],
  "conditional mutable binding preserves the pointee domain and rejects signed layout substitution": [
    {
      "code": "CSHARP_NATIVE_POINTER_OPERATION_NOT_MAPPED",
      "message": "C# native-pointer 'raw-location' is not mapped: The typed location and selected memory layout have different C# pointee representations.",
      "text": "torawptr(true ? pointer : undefined, layout)",
      "file": "/src/index.ts"
    },
    {
      "code": "CSHARP_NATIVE_BACKING_NOT_PROVEN",
      "message": "The physical storage origin and layout have different exact native value types.",
      "text": "allocateptr<uint32>(4)",
      "file": "/src/index.ts"
    },
    {
      "code": "CSHARP_NATIVE_BACKING_NOT_PROVEN",
      "message": "The physical storage origin and layout have different exact native value types.",
      "text": "allocateptr<uint32>(3)",
      "file": "/src/index.ts"
    }
  ],
  "inferred default return preserves the pointee domain and rejects signed layout substitution": [
    {
      "code": "CSHARP_NATIVE_POINTER_OPERATION_NOT_MAPPED",
      "message": "C# native-pointer 'raw-location' is not mapped: The raw conversion operand has no exact native carrier.",
      "text": "torawptr(get(), layout)",
      "file": "/src/index.ts"
    },
    {
      "code": "CSHARP_NATIVE_BACKING_NOT_PROVEN",
      "message": "The physical storage origin and layout have different exact native value types.",
      "text": "allocateptr<uint32>(3)",
      "file": "/src/index.ts"
    }
  ],
  "generic return preserves the pointee domain and rejects signed layout substitution": [
    {
      "code": "CSHARP_NATIVE_POINTER_OPERATION_NOT_MAPPED",
      "message": "C# native-pointer 'raw-location' is not mapped: The typed location and selected memory layout have different C# pointee representations.",
      "text": "torawptr(identity(allocateptr<uint32>(3)), layout)",
      "file": "/src/index.ts"
    },
    {
      "code": "CSHARP_NATIVE_BACKING_NOT_PROVEN",
      "message": "The physical storage origin and layout have different exact native value types.",
      "text": "allocateptr<uint32>(3)",
      "file": "/src/index.ts"
    }
  ],
  "reinterpret rejects a distinct primitive domain despite equal number carriers": [
    {
      "code": "CSHARP_NATIVE_POINTER_OPERATION_NOT_MAPPED",
      "message": "C# native-pointer 'raw-location' is not mapped: Reinterpretation and its selected layout have different exact C# pointee types.",
      "text": "reinterpretrawptr<uint32>(raw, signed)",
      "file": "/src/index.ts"
    }
  ],
  "to-raw rejects a distinct primitive domain despite equal number carriers": [
    {
      "code": "CSHARP_POINTER_BACKING_NOT_PROVEN",
      "message": "Physical pointer backing requires a closed source storage domain (external-input).",
      "text": "unsigned: Pointer<uint32>",
      "file": "/src/index.ts"
    },
    {
      "code": "CSHARP_NATIVE_POINTER_OPERATION_NOT_MAPPED",
      "message": "C# native-pointer 'raw-location' is not mapped: The typed location and selected memory layout have different C# pointee representations.",
      "text": "torawptr(unsigned, signed)",
      "file": "/src/index.ts"
    }
  ],
  "an imported same-carrier signed array cannot replace an unsigned pointer pointee": [
    {
      "code": "CSHARP_NATIVE_POINTER_OPERATION_NOT_MAPPED",
      "message": "C# native-pointer 'raw-location' is not mapped: The typed location and selected memory layout have different C# pointee representations.",
      "text": "torawptr(pointer, layout)",
      "file": "/src/index.ts"
    },
    {
      "code": "CSHARP_NATIVE_POINTER_OPERATION_NOT_MAPPED",
      "message": "C# native-pointer 'raw-location' is not mapped: Reinterpretation and its selected layout have different exact C# pointee types.",
      "text": "reinterpretrawptr<Pair>(raw, layout)",
      "file": "/src/index.ts"
    },
    {
      "code": "CSHARP_NATIVE_BACKING_NOT_PROVEN",
      "message": "The physical storage origin and layout have different exact native value types.",
      "text": "allocateptr<Pair>(value)",
      "file": "/src/index.ts"
    }
  ],
  "raw array conversion rejects a different primitive pointee despite identical carrier and total dimensions": [
    {
      "code": "CSHARP_POINTER_BACKING_NOT_PROVEN",
      "message": "Physical pointer backing requires a closed source storage domain (external-input).",
      "text": "pointer: Pointer<FixedArray<uint32, 2>>",
      "file": "/src/index.ts"
    },
    {
      "code": "CSHARP_NATIVE_POINTER_OPERATION_NOT_MAPPED",
      "message": "C# native-pointer 'raw-location' is not mapped: The selected layout has no closed all-bit-pattern C# native value representation.",
      "text": "torawptr(pointer, array)",
      "file": "/src/index.ts"
    },
    {
      "code": "CSHARP_NATIVE_POINTER_OPERATION_NOT_MAPPED",
      "message": "C# native-pointer 'raw-location' is not mapped: The selected layout has no closed all-bit-pattern C# native value representation.",
      "text": "reinterpretrawptr<FixedArray<uint32, 2>>(raw, array)",
      "file": "/src/index.ts"
    }
  ],
  "memory bindings reject signed instead of unsigned field": [
    {
      "code": "CSHARP_UNSUPPORTED_AST",
      "message": "The selected location and bound field have different C# pointee carriers.",
      "text": "bindmemoryfield(countField, pointer)",
      "file": "/src/index.ts"
    }
  ]
};

for (const source of phaseCases) {
  for (const surface of ["native", "js"]) {
    test(`native memory phase admission preserves ${source.name} (${surface})`, { timeout: 300_000 }, () => {
      const compiled = compileCsharpSource({ sourceText: source.sourceText, files: source.files,
        projectRoot: "/src", surface, capabilities: [memoryAbiCapability("csharp")] });
      assertCsharpCheckingSucceeded(compiled);
      const diagnostics = compiled.result.diagnostics.map(issue => {
        const range = issue.sourceNode === undefined ? undefined : compiled.source.ast.authoredRange(issue.sourceNode);
        const file = issue.sourceNode === undefined ? undefined : compiled.source.ast.getSourceFile(issue.sourceNode);
        const fileName = file === undefined ? undefined : compiled.source.ast.getFileName(file);
        const text = fileName === "/src/index.ts" ? source.sourceText : source.files?.[fileName];
        return { code: issue.code, message: issue.message,
          text: range?.kind === "authored" ? text?.slice(range.start, range.end) : undefined, file: fileName };
      });
      assert.deepEqual(diagnostics, expectedDiagnostics[source.name]);
      assert.equal(compiled.artifacts.size, 0);
    });
  }
}
