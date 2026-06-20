import { test } from "node:test";
import assert from "node:assert/strict";
import { printCsharpType } from "../dist/print/csharp-printer.js";

test("printer preserves C# array rank", () => {
  assert.equal(printCsharpType({ kind: "array", elementType: { kind: "predefined", name: "int" } }), "int[]");
  assert.equal(printCsharpType({ kind: "array", elementType: { kind: "predefined", name: "int" }, rank: 2 }), "int[,]");
  assert.equal(printCsharpType({ kind: "array", elementType: { kind: "predefined", name: "int" }, rank: 3 }), "int[,,]");
});

test("printer renders pointer and function-pointer type nodes", () => {
  assert.equal(printCsharpType({ kind: "pointer", pointee: { kind: "predefined", name: "int" } }), "int*");
  assert.equal(
    printCsharpType({
      kind: "functionPointer",
      parameters: [{ kind: "predefined", name: "int" }],
      returnType: { kind: "predefined", name: "int" },
    }),
    "delegate*<int, int>",
  );
});
