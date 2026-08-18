import assert from "node:assert/strict";
import test from "node:test";

import {
  compileCsharpSource,
} from "../../../helpers/direct-csharp-session.mjs";

test("direct C# translation lowers exact wide source literals without broad BigInteger carriers", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      import type { int64, uint64, int128, uint128 } from "@tsonic/core/types.js";
      export const signed: int64 = 1n;
      export const negative: int64 = -2n;
      export const minimum: int64 = -9223372036854775808n;
      export const unsigned: uint64 = 18446744073709551615n;
      export const signed128: int128 = -170141183460469231731687303715884105728n;
      export const unsigned128: uint128 = 340282366920938463463374607431768211455n;
      export const asserted = 3n as int64;
      export const asserted128 = -170141183460469231731687303715884105728n as int128;
      export const values: int64[] = [4n, 5n];
      export const broad: bigint = 6n;
    `,
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  const source = compiled.artifacts.get("src/Index.cs");
  assert.match(source, /signed = 1L;/u);
  assert.match(source, /negative = -2L;/u);
  assert.match(source, /minimum = long\.MinValue;/u);
  assert.match(source, /unsigned = 18446744073709551615UL;/u);
  assert.match(source, /signed128 = new Int128\(9223372036854775808UL, 0UL\);/u);
  assert.match(source, /unsigned128 = new UInt128\(18446744073709551615UL, 18446744073709551615UL\);/u);
  assert.match(source, /asserted = 3L;/u);
  assert.match(source, /asserted128 = new Int128\(9223372036854775808UL, 0UL\);/u);
  assert.match(source, /values = new long\[\] \{ 4L, 5L \};/u);
  assert.match(source, /broad = System\.Numerics\.BigInteger\.Parse\("6"\);/u);
});
