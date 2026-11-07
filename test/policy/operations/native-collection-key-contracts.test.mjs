import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const [name, sourceText] of [
  ["open Set element", `
    import type { int32, uint32 } from "@tsonic/core/types.js";
    function collect<T>(values: T[]): Set<T> { return new Set(values); }
    export function run(): boolean {
      const signed: int32 = 1;
      const unsigned: uint32 = 1;
      const values: (int32 | uint32)[] = [signed, unsigned];
      const result = collect(values);
      return result.size === 1 && result.has(signed) && result.has(unsigned);
    }
  `],
  ["open Map key and value", `
    import type { int32, uint32 } from "@tsonic/core/types.js";
    function collect<K, V>(keys: K[], value: V): Map<K, V> {
      const result = new Map<K, V>();
      result.set(keys[0], value);
      result.set(keys[1], value);
      return result;
    }
    export function run(): boolean {
      const signed: int32 = 1;
      const unsigned: uint32 = 1;
      const values: (int32 | uint32)[] = [signed, unsigned];
      const result = collect(values, "retained");
      return result.size === 1 && result.get(signed) === "retained" && result.get(unsigned) === "retained";
    }
  `],
  ["mixed primitive Set element", `
    import type { int32 } from "@tsonic/core/types.js";
    export function run(): boolean {
      const signed: int32 = 1;
      const values: (int32 | string)[] = [signed, "one"];
      const result = new Set(values);
      return result.size === 2 && result.has(signed) && result.has("one");
    }
  `],
  ["optional native Set element", `
    import type { int32, uint32 } from "@tsonic/core/types.js";
    function collect<T>(values: T[]): Set<T> { return new Set(values); }
    export function run(): boolean {
      const signed: int32 = 1;
      const unsigned: uint32 = 1;
      const values: (int32 | uint32 | undefined)[] = [undefined, signed, unsigned];
      const result = collect(values);
      return result.size === 2 && result.has(undefined) && result.has(signed) && result.has(unsigned);
    }
  `],
]) {
  test(`native collection key witnesses preserve ${name} across a real invocation`, () => {
    const compiled = compileCsharpSource({ surface: "js", sourceText });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `native-collection-key-${name.replaceAll(" ", "-")}`);
  });
}

test("closed numeric-key lookups retain native zero-allocation cost across real emitted calls", () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    import type { int32, uint32 } from "@tsonic/core/types.js";
    export function create(signed: int32, unsigned: uint32): Set<int32 | uint32> {
      const values: (int32 | uint32)[] = [signed, unsigned];
      return new Set(values);
    }
    export function has(values: Set<int32 | uint32>, value: int32 | uint32): boolean {
      return values.has(value);
    }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  const output = executeCsharpConstruction(compiled, "closed-numeric-key-native-cost", false, false, [], `
    var signed = Tsonic.CSharp.Runtime.Union<int, uint>.From1(17);
    var unsigned = Tsonic.CSharp.Runtime.Union<int, uint>.From2(17U);
    var values = Tsonic.Generated.Index.create(17, 17U);
    var reference = new System.Collections.Generic.HashSet<Tsonic.CSharp.Js.UnionCollectionKey<int, uint>> {
      Tsonic.CSharp.Js.UnionCollectionKey<int, uint>.Create(signed)
    };
    if (values.size != 1 || !Tsonic.Generated.Index.has(values, signed) || !Tsonic.Generated.Index.has(values, unsigned))
        throw new System.Exception("exact numeric key equality");
    for (var index = 0; index < 4096; index++) {
        Tsonic.Generated.Index.has(values, unsigned);
        reference.Contains(Tsonic.CSharp.Js.UnionCollectionKey<int, uint>.Create(unsigned));
    }
    var beforeGenerated = System.GC.GetAllocatedBytesForCurrentThread();
    var actual = 0;
    for (var index = 0; index < 65536; index++) if (Tsonic.Generated.Index.has(values, unsigned)) actual++;
    var generatedBytes = System.GC.GetAllocatedBytesForCurrentThread() - beforeGenerated;
    var beforeReference = System.GC.GetAllocatedBytesForCurrentThread();
    var expected = 0;
    for (var index = 0; index < 65536; index++)
        if (reference.Contains(Tsonic.CSharp.Js.UnionCollectionKey<int, uint>.Create(unsigned))) expected++;
    var referenceBytes = System.GC.GetAllocatedBytesForCurrentThread() - beforeReference;
    if (actual != 65536 || actual != expected || generatedBytes != 0 || generatedBytes != referenceBytes)
        throw new System.Exception($"native key allocation: generated={generatedBytes}, reference={referenceBytes}");
    System.Console.WriteLine($"native key allocation generated={generatedBytes} reference={referenceBytes}");`);
  assert.equal(output.includes("native key allocation generated=0 reference=0"), true,
    "the actual selected Set key path preserves native equality with the same zero allocation as handwritten HashSet lookup");
});
