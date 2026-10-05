import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of [undefined, "js"]) {
  test(`cross-file record union literals retain native int64 values on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, files: { "records.ts": `
      import type { int64 } from "@tsonic/core/types.js";
      export type Input = string | number | Record<string, int64> | null;
      export function read(value?: Input): int64 {
        if (value == null) return -1n;
        if (typeof value === "string") return -2n;
        if (typeof value === "number") return -3n;
        return value["count"];
      }
    ` }, sourceText: `
      import { read } from "./records.js";
      import type { int64 } from "@tsonic/core/types.js";
      export function run(): boolean {
        const count: int64 = 9007199254740993n;
        return read({ count }) === count && read({ count: 9007199254740993n }) === 9007199254740993n &&
          read({ count: -9007199254740993n }) === -9007199254740993n &&
          read({ count: 9223372036854775807n }) === 9223372036854775807n &&
          read({ count: -9223372036854775808n }) === -9223372036854775808n &&
          read() === -1n && read(null) === -1n && read("text") === -2n && read(3) === -3n;
      }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `indexed-record-union-${surface ?? "native"}`);
  });

  test(`record union literals do not admit incompatible indexed values on ${surface ?? "native"}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      import type { int64 } from "@tsonic/core/types.js";
      function read(value: string | Record<string, int64>): void {}
      export function main(): void { read({ count: "not an integer" }); }
    ` });
    assert.equal(compiled.sourceDiagnosticsText.length > 0, true);
    assert.equal(compiled.artifacts.size, 0);
  });
}
