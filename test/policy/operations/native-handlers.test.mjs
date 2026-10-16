import assert from "node:assert/strict";
import test from "node:test";

import { selectCsharpNativeHandler } from "../../../dist/policy/operations/pointers/native-handlers.js";
import { selectCsharpNativePointerOperation } from "../../../dist/policy/operations/pointers/native-pointers.js";
import { rawPointerOperationFactKey } from "@tsonic/tsts";
import { tsonicNativePointerOperationFactKey } from "@tsonic/source-core/facts";
import { csharpRuntimeRawPointerTargetType } from "../../../dist/target-model/types/carriers/runtime-carriers.js";

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
    assert.equal(typeof selectCsharpNativeHandler === "function", true,
      "policy/operations/pointers/native-handlers.js exports selectCsharpNativeHandler");
    for (const [name, inputs] of cases) {
      const selected = selectCsharpNativeHandler(...inputs);
      assert.equal(selected?.kind === handler, true, `${row}, ${name}: expected ${handler ?? "none"}, selected ${selected?.kind ?? "none"}`);
      if (handler !== undefined) {
        const index = ["memory-binding", "explicit-safety", "js-string-conversion", "native-pointer", "typed-location"].indexOf(handler);
        assert.equal(selected.selection === inputs[index], true, `${row}, ${name}: exact native selection`);
        assert.equal(Object.isFrozen(selected), true);
      }
    }
  });
}

test("unchosen native pointer candidates do no carrier-resolution work on exact checked identities", () => {
  const node = {};
  const operand = {};
  const sourceType = {};
  const scalar = { kind: "source-primitive", name: "int32" };
  const raw = csharpRuntimeRawPointerTargetType();
  const pointer = { kind: "pointer", pointee: scalar };
  const native = { operation: "load", pointerExpression: operand, pointerType: sourceType };
  const identity = { call: node, operation: "hash-raw-pointer", pointerExpression: operand, pointerType: sourceType };
  for (const [name, facts, carrier, expected, queries] of [
    ["ordinary", new Map(), undefined, "not-native-pointer", 0],
    ["native load", new Map([[tsonicNativePointerOperationFactKey, native]]), pointer, "load", 1],
    ["raw identity", new Map([[rawPointerOperationFactKey, identity]]), raw, "raw-identity", 1],
  ]) {
    let reads = 0;
    const policy = { sourceFacts: { getFact: (subject, key) => subject === node ? facts.get(key) : undefined },
      ast: { is: { IsCallExpression: subject => subject === node }, arguments: () => [operand] },
      types: { resolveSelectedValue(subject, selectedType) {
        reads++; assert.equal(subject === operand && selectedType === sourceType, true, name); return carrier;
      } } };
    const selected = selectCsharpNativePointerOperation(policy, node, {});
    assert.equal(selected.kind, expected, name);
    assert.equal(reads, queries, `${name}: only its native answer resolves carriers`);
  }
});
