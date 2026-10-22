import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

const factorySource = `
  export function make<Outer extends number | bigint>(outer: Outer) {
    return class Box<Inner> {
      readonly outer: Outer = outer;
      inner: Inner;
      constructor(inner: Inner) { this.inner = inner; }
      read(): Outer { return outer; }
      echo<Value>(value: Value): Value { return value; }
    };
  }
`;

for (const surface of [undefined, "js"]) {
  test(`cross-file local class shapes retain captured, construction and method quantifiers (${surface ?? "native"})`,
    { timeout: 300_000 }, () => {
      const files = {
        "left.ts": factorySource,
        "right.ts": factorySource,
        "alias.ts": 'export { make as create } from "./left.js";',
      };
      const compiled = compileCsharpSource({ surface, files, sourceText: `
        import type { int32, int64 } from "@tsonic/core/types.js";
        import { create as make } from "./alias.js";
        import { make as other } from "./right.js";
        export function run(): boolean {
          const Constructor = make<int64>(9007199254740993n);
          const Alias = Constructor;
          const first = new Constructor<int32>(7);
          const second = new Alias<string>("stored");
          const Other = other<int64>(9007199254740993n);
          const foreign = new Other<int32>(8);
          first.inner = first.echo<int32>(9);
          return first.inner === 9 && second.inner === "stored" &&
            first.outer === 9007199254740993n && first.read() === 9007199254740993n &&
            second.echo<string>("exact") === "exact" && foreign.read() === 9007199254740993n &&
            first instanceof Constructor && second instanceof Alias && !(first instanceof Other);
        }
      ` });
      executeCsharpConstruction(compiled, `cross-file-local-class-shapes-${surface ?? "native"}`);
      const generated = [...compiled.artifacts.values()].join("\n");
      assert.equal([...generated.matchAll(/Create<Inner>\(Inner inner\)/gu)].length, 2,
        "each checked declaration keeps its construction quantifier");
      assert.equal([...generated.matchAll(/echo<Value>\(Value value\)/gu)].length, 2,
        "method quantifiers remain on their exact native method owners");
      assert.match(generated, /ReferenceEquals/u);
      assert.doesNotMatch(generated, /Activator|System\.Reflection|DynamicInvoke|Convert\.ToDouble|__TsonicShape_/u);
    });
}

test("local class shape selection adds no allocation beyond its native factory and instance", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ files: { "factory.ts": factorySource }, sourceText: `
    import type { int32, int64 } from "@tsonic/core/types.js";
    import { make } from "./factory.js";
    export function build(outer: int64, inner: int32) {
      const Constructor = make<int64>(outer);
      const instance = new Constructor<int32>(inner);
      if (!(instance instanceof Constructor) || instance.read() !== outer) throw new Error("factory identity");
      return instance;
    }
    export function run(): boolean {
      const value = build(9007199254740993n, 7);
      return value.outer === 9007199254740993n && value.inner === 7 && value.echo<int32>(11) === 11;
    }
  ` });
  const output = executeCsharpConstruction(compiled, "local-class-shape-native-cost", false, false, [], `
using System;
using System.Runtime.CompilerServices;
using Index = Tsonic.Generated.Index;
if (!Index.run()) throw new Exception("exact source generic class values");
for (int index = 0; index < 1000; index++) {
    GC.KeepAlive(Index.build(9007199254740993L, index));
    GC.KeepAlive(Handwritten(9007199254740993L, index));
}
long before = GC.GetAllocatedBytesForCurrentThread();
for (int index = 0; index < 10000; index++) GC.KeepAlive(Index.build(9007199254740993L, index));
long generated = GC.GetAllocatedBytesForCurrentThread() - before;
before = GC.GetAllocatedBytesForCurrentThread();
for (int index = 0; index < 10000; index++) GC.KeepAlive(Handwritten(9007199254740993L, index));
long native = GC.GetAllocatedBytesForCurrentThread() - before;
if (generated != native) throw new Exception($"local class native allocation {generated} != {native}");
Console.WriteLine($"{generated}:{native}");
[MethodImpl(MethodImplOptions.NoInlining)]
static NativeBox<long, int> Handwritten(long outer, int inner) {
    var factory = new NativeFactory<long>(outer);
    var value = factory.Create(inner);
    if (!ReferenceEquals(value.Environment, factory) || value.read() != outer) throw new Exception("factory identity");
    return value;
}
sealed class NativeFactory<Outer> {
    internal readonly Outer Captured;
    internal NativeFactory(Outer captured) { Captured = captured; }
    internal NativeBox<Outer, Inner> Create<Inner>(Inner inner) => new NativeBox<Outer, Inner>(this, inner);
}
sealed class NativeBox<Outer, Inner> {
    internal readonly Outer outer;
    internal Inner inner;
    internal readonly NativeFactory<Outer> Environment;
    internal NativeBox(NativeFactory<Outer> environment, Inner value) {
        Environment = environment; outer = environment.Captured; inner = value;
    }
    internal Outer read() => Environment.Captured;
}
` );
  assert.match(output, /^\d+:\d+\s*$/u);
  const generated = [...compiled.artifacts.values()].join("\n");
  assert.doesNotMatch(generated, /Activator|System\.Reflection|DynamicInvoke|Convert\.ToDouble|__TsonicShape_/u);
});
