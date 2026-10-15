import assert from "node:assert/strict";
import test from "node:test";
import { sourcePrimitiveImplicitlyConverts } from "../../../dist/policy/conversions/source-primitives.js";

test("C# native-word implicit conversions follow C# signed and unsigned domains", () => {
  const domains = new Map([
    ["int8", ["native-int"]], ["uint8", ["native-int", "native-uint"]],
    ["int16", ["native-int"]], ["uint16", ["native-int", "native-uint"]],
    ["char", ["native-int", "native-uint"]], ["int32", ["native-int"]],
    ["uint32", ["native-uint"]], ["int64", []], ["uint64", []],
    ["float32", []], ["float64", []], ["decimal", []], ["bool", []],
  ]);
  const primitive = name => ({ kind: "source-primitive", name });
  for (const [source, targets] of domains) {
    for (const target of ["native-int", "native-uint"]) {
      assert.equal(sourcePrimitiveImplicitlyConverts(primitive(target), primitive(source)),
        targets.includes(target), `${source} -> ${target}`);
    }
  }
  for (const source of ["native-int", "native-uint"]) {
    const targets = [source === "native-int" ? "int64" : "uint64", "float32", "float64", "decimal"];
    for (const target of [...domains.keys(), "native-int", "native-uint"]) {
      assert.equal(sourcePrimitiveImplicitlyConverts(primitive(target), primitive(source)),
        targets.includes(target), `${source} -> ${target}`);
    }
  }
});
