import assert from "node:assert/strict";
import test from "node:test";

const policy = await import("../../../dist/policy/operations/pointers/native-handlers.js").catch(error => {
  if (error?.code === "ERR_MODULE_NOT_FOUND") return {};
  throw error;
});

const binding = Object.freeze({ kind: "field" });
const rejectedBinding = Object.freeze({ kind: "rejected", reason: "binding" });
const unsafeContext = Object.freeze({ kind: "unsafe-context" });
const safetyBuilder = Object.freeze({ kind: "safety-builder" });
const conversion = Object.freeze({ kind: "resolved" });
const rejectedConversion = Object.freeze({ kind: "rejected", reason: "conversion" });
const notConversion = Object.freeze({ kind: "not-js-string-conversion" });
const pointer = Object.freeze({ kind: "layout-query", value: 4 });
const rejectedPointer = Object.freeze({ kind: "rejected", operation: "load", reason: "pointer" });
const notPointer = Object.freeze({ kind: "not-native-pointer" });
const location = Object.freeze({ kind: "location-address" });
const rejectedLocation = Object.freeze({ kind: "rejected", operation: "location-address", reason: "location" });
const notLocation = Object.freeze({ kind: "not-typed-location" });

const precedence = [
  ["memory binding", "memory-binding", [
    ["a field binding over every later selection", [binding, unsafeContext, conversion, pointer, location]],
    ["a rejected binding over every later selection", [rejectedBinding, safetyBuilder, rejectedConversion, rejectedPointer, rejectedLocation]],
    ["a field binding alone", [binding, undefined, undefined, undefined, undefined]],
  ]],
  ["explicit safety", "explicit-safety", [
    ["an unsafe context over every later selection", [undefined, unsafeContext, conversion, pointer, location]],
    ["a safety builder over every later selection", [undefined, safetyBuilder, rejectedConversion, rejectedPointer, rejectedLocation]],
    ["an unsafe context alone", [undefined, unsafeContext, notConversion, notPointer, notLocation]],
  ]],
  ["JS string conversion", "js-string-conversion", [
    ["a resolved conversion over every later selection", [undefined, undefined, conversion, pointer, location]],
    ["a rejected conversion over every later selection", [undefined, undefined, rejectedConversion, rejectedPointer, rejectedLocation]],
    ["a resolved conversion alone", [undefined, undefined, conversion, notPointer, notLocation]],
  ]],
  ["native pointer", "native-pointer", [
    ["a resolved pointer operation after no conversion", [undefined, undefined, notConversion, pointer, location]],
    ["a rejected pointer operation over a typed location", [undefined, undefined, undefined, rejectedPointer, rejectedLocation]],
    ["a resolved pointer operation alone", [undefined, undefined, undefined, pointer, notLocation]],
  ]],
  ["typed location", "typed-location", [
    ["a resolved location after no conversion and no pointer operation", [undefined, undefined, notConversion, notPointer, location]],
    ["a rejected location", [undefined, undefined, undefined, undefined, rejectedLocation]],
  ]],
  ["none", undefined, [
    ["no selection", [undefined, undefined, undefined, undefined, undefined]],
    ["only not-selected outcomes", [undefined, undefined, notConversion, notPointer, notLocation]],
  ]],
];

for (const [row, handler, cases] of precedence) {
  test(`native handler precedence row: ${row}`, () => {
    assert.equal(typeof policy.selectCsharpNativeHandler === "function", true,
      "policy/operations/pointers/native-handlers.js exports selectCsharpNativeHandler");
    for (const [name, inputs] of cases) {
      const selected = policy.selectCsharpNativeHandler(...inputs);
      assert.equal(selected === handler, true, `${row}, ${name}: expected ${handler ?? "none"}, selected ${selected ?? "none"}`);
    }
  });
}
