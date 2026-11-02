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

