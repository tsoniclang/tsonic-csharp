import { test } from "node:test";
import assert from "node:assert/strict";
import { printCsharpType } from "../dist/print/csharp-printer.js";

test("printer preserves C# array rank", () => {
  assert.equal(printCsharpType({ kind: "ArrayType", elementType: { kind: "PredefinedType", name: "int" } }), "int[]");
  assert.equal(printCsharpType({ kind: "ArrayType", elementType: { kind: "PredefinedType", name: "int" }, rank: 2 }), "int[,]");
  assert.equal(printCsharpType({ kind: "ArrayType", elementType: { kind: "PredefinedType", name: "int" }, rank: 3 }), "int[,,]");
});

test("printer renders pointer and function-pointer type nodes", () => {
  assert.equal(printCsharpType({ kind: "PointerType", pointee: { kind: "PredefinedType", name: "int" } }), "int*");
  assert.equal(
    printCsharpType({
      kind: "FunctionPointerType",
      parameters: [{ kind: "PredefinedType", name: "int" }],
      returnType: { kind: "PredefinedType", name: "int" },
    }),
    "delegate*<int, int>",
  );
});
