import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { nativeWordConversionsSource } from "../../../../tsonic/test/fixtures/native-word-conversions.mjs";

test("native-word conversions preserve exact values, absence and evaluation count", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: nativeWordConversionsSource });
  executeCsharpConstruction(compiled, "native-word-conversions");
  const output = [...compiled.artifacts.values()].join("\n");
  assert.match(output, /nuint/u);
  assert.doesNotMatch(output, /Convert\.ToDouble|\(double\)/u);
});

test("C# native-word implicit conversions use their native numeric domains", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: `
    import type { int32, nativeInt, nativeUint, uint16, uint32 } from "@tsonic/core/types.js";
    function signed(value: int32): nativeInt { return value; }
    function unsigned(value: uint32): nativeUint { return value; }
    function small(value: uint16): nativeInt { return value; }
    export function run(): boolean {
      return signed(-2147483648) === -2147483648 &&
        unsigned(4294967295) === 4294967295 && small(65535) === 65535;
    }
  ` }), "native-word-domain-conversions");
});
