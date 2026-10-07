import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of [undefined, "js"]) {
  test(`project utilities retain exact integers, field aliases and native opaque field types (${surface ?? "native"})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, files: {
      "records.ts": `
        import type { int64, RawPointer } from "@tsonic/core/types.js";
        export interface Box { value: int64; label: string; }
        export type Selected = Readonly<Pick<Box, "value">>;
        export type View<Value> = { readonly [Key in keyof Value]: Value[Key] };
        export type Fixed = Record<"left" | "right", int64>;
        export type Address = RawPointer;
        export interface Holder { address: Address; }
      `,
    }, sourceText: `
      import type { int64, RawPointer } from "@tsonic/core/types.js";
      import type { Box, Selected, View, Fixed, Address, Holder } from "./records.js";
      function read(value: Selected): int64 { return value.value; }
      function mapped(value: View<Box>): int64 { return value.value; }
      function sum(value: Fixed): int64 { return value.left + value.right; }
      function inline(value: Record<"left" | "right", int64>): int64 { return value.left + value.right; }
      export function raw(value: Address): RawPointer { return value; }
      export function nested(value: Readonly<Holder>): RawPointer { return value.address; }
      export function run(): boolean {
        const box: Box = { value: 9007199254740993n, label: "exact" };
        const alias = box;
        alias.value += 1n;
        return read(box) === 9007199254740994n && mapped(box) === 9007199254740994n &&
          sum({ left: 9007199254740993n, right: 1n }) === 9007199254740994n &&
          inline({ left: 9007199254740993n, right: 1n }) === 9007199254740994n;
      }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    const output = [...compiled.artifacts.values()].join("\n");
    assert.match(output, /public static long read\(/u);
    assert.match(output, /public static long mapped\(/u);
    assert.match(output, /public static long sum\(/u);
    assert.match(output, /Tsonic\.CSharp\.Runtime\.RawPointer/u);
    assert.doesNotMatch(output, /__tsonicSourceType|Convert\.ToDouble|System\.Reflection/u);
    executeCsharpConstruction(compiled, `structural-shape-ownership-${surface ?? "native"}`);
  });
}

test("cross-file native readonly views preserve exact integer identity without per-read allocation", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ files: { "records.ts": `
    import type { int64 } from "@tsonic/core/types.js";
    export interface Box { value: int64; label: string; }
    export type View<Value> = { readonly [Key in keyof Value]: Value[Key] };
    export type Selected = Readonly<Pick<Box, "value">>;
  ` }, sourceText: `
    import type { int64 } from "@tsonic/core/types.js";
    import type { Box, View, Selected } from "./records.js";
    export function create(): Box { return { value: 9007199254740993n, label: "exact" }; }
    export function read(value: Selected): int64 { return value.value; }
    export function mapped(value: View<Box>): int64 { return value.value; }
    export function forward(value: Box): int64 { return read(value) + mapped(value); }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  const output = [...compiled.artifacts.values()].join("\n");
  assert.match(output, /public interface Box :/u);
  assert.match(output, /new long value/u);
  assert.doesNotMatch(output, /BigInteger|Convert\.ToDouble|System\.Reflection/u);
  const result = executeCsharpConstruction(compiled, "cross-file-native-readonly-view-cost", false, false, [], `
    Tsonic.Generated.Box box = Tsonic.Generated.Index.create();
    Tsonic.Generated.Box alias = box;
    alias.value += 1L;
    if (!System.Object.ReferenceEquals(box, alias)) throw new System.Exception("native alias identity");
    for (int index = 0; index < 1000; index++) {
        Tsonic.Generated.Index.read(box);
        Tsonic.Generated.Index.mapped(box);
    }
    long before = System.GC.GetAllocatedBytesForCurrentThread();
    long total = 0L;
    for (int index = 0; index < 10000; index++) total ^= Tsonic.Generated.Index.read(box) ^ Tsonic.Generated.Index.mapped(box);
    long allocated = System.GC.GetAllocatedBytesForCurrentThread() - before;
    if (allocated != 0L || total != 0L || Tsonic.Generated.Index.read(alias) != 9007199254740994L) throw new System.Exception("native view identity/cost");
    System.Console.WriteLine(allocated);
  `);
  assert.equal(result.trim(), "0", "native readonly projections do not allocate or copy objects");
});
