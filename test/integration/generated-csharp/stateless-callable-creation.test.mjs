import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of ["native", "js"]) {
  test(`lexical super and this callbacks retain receiver dispatch and fresh identities in ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      export class Base {
        constructor(public value: number) {}
        read(): number { return this.value; }
      }
      export class Derived extends Base {
        constructor(value: number) { super(value); }
        read(): number { return 99; }
        createSuper(): () => number { return () => super.read(); }
        createThis(): () => number { return () => this.read(); }
        createNested(): () => (() => number) { return () => () => super.read(); }
      }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `super-callable-creation-${surface}`, false, false, [], `
var first = new Tsonic.Generated.Derived(3);
var second = new Tsonic.Generated.Derived(7);
var firstSuper = first.createSuper();
var secondSuper = second.createSuper();
var firstThis = first.createThis();
var nested = first.createNested();
var nestedRead = nested();
if (firstSuper() != 3 || secondSuper() != 7 || firstThis() != 99 || nestedRead() != 3) throw new System.Exception("exact base and virtual receiver dispatch");
if (object.ReferenceEquals(firstSuper, first.createSuper()) || object.ReferenceEquals(firstSuper, secondSuper) ||
    object.ReferenceEquals(nested, first.createNested()) || object.ReferenceEquals(nestedRead, nested())) throw new System.Exception("receiver callable creation identity");
first.value = 8;
if (firstSuper() != 8 || nestedRead() != 8 || secondSuper() != 7) throw new System.Exception("retained live receiver");
for (var warmup = 0; warmup < 100; warmup++) { firstSuper(); nestedRead(); firstThis(); }
var before = System.GC.GetAllocatedBytesForCurrentThread();
for (var iteration = 0; iteration < 10000; iteration++) {
    if (firstSuper() != 8 || nestedRead() != 8 || firstThis() != 99) throw new System.Exception("retained receiver invocation");
}
if (System.GC.GetAllocatedBytesForCurrentThread() != before) throw new System.Exception("receiver invocation allocation");
`);
  });
}

test("sealed Array.from mappers match idiomatic native allocation without erasing callable identity", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    import type { int } from "@tsonic/csharp/types.js";
    export function mapped(values: int[]): int[] {
      return Array.from(values, (value): int => value + 1);
    }
    export function aliased(values: int[]): int[] {
      const mapper = (value: int): int => value + 1;
      const alias = mapper;
      return Array.from(values, alias);
    }
    export function generic<T>(values: T[]): T[] {
      return Array.from(values, value => value);
    }
    export function captured(values: int[], step: int): int[] {
      return Array.from(values, (value): int => value + step);
    }
    export function mutated(values: int[]): int[] {
      let step: int = 0;
      const result = Array.from(values, (value): int => value + ++step);
      if (step !== 2) throw new Error("captured mutation");
      return result;
    }
    export function selfValue(values: int[]): int[] {
      return Array.from(values, function self(value: int, index: int): int {
        const alias = self;
        if (alias !== self) throw new Error("named self identity");
        return value + index;
      });
    }
    export function loop(values: int[], count: int): int {
      let total: int = 0;
      for (let index: int = 0; index < count; index++) {
        const result = Array.from(values, (value): int => value + 1);
        total += result[0];
      }
      return total;
    }
    function unknown(mapper: (value: int) => int): (value: int) => int { return mapper; }
    export function intoUnknown(): (value: int) => int { return unknown(value => value + 1); }
    export function mixed(values: int[]): (value: int) => int {
      const mapper = (value: int): int => value + 1;
      const alias = mapper;
      Array.from(values, alias);
      return unknown(mapper);
    }
    export function returned(): () => int { return (): int => 7; }
    export function retained(value: int): () => int { return (): int => ++value; }
    export function failed(values: int[], error: Error): int[] {
      return Array.from(values, (_value): int => { throw error; });
    }
    class Foreign {
      from(mapper: (value: int) => int): (value: int) => int { return mapper; }
    }
    export function foreign(): (value: int) => int {
      const Array = new Foreign();
      return Array.from(value => value + 1);
    }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  const source = compiled.artifacts.get("src/Index.cs");
  assert.equal(typeof source, "string");
  assert.equal(/static int __tsonic_callable_/u.test(source), true, "exact stateless local function");
  assert.equal(/\(Func<int, int, int>\)__tsonic_callable_/u.test(source), true, "native method-group binding without a manual cache");
  assert.equal(/new Func<int, int>\(__tsonic_callable_/u.test(source), true, "unknown consumers retain fresh delegate construction");
  assert.equal(/Dictionary|Reflection|dynamic\b|Unsafe\./u.test(source), false, "no cache framework, reflection or unchecked adapter");
  executeCsharpConstruction(compiled, "stateless-callable-creation", false, false, [], `
using Tsonic.CSharp.Js;
using Index = Tsonic.Generated.Index;
var input = JSArray<int>.of([1, 2]);
var captured = Index.captured(input, 4);
if (captured[0] != 5 || captured[1] != 6 || Index.captured(input, 9)[0] != 10) throw new System.Exception("fresh captured activation");
var mutated = Index.mutated(input);
if (mutated[0] != 2 || mutated[1] != 4) throw new System.Exception("live captured mutation");
var selfValue = Index.selfValue(input);
if (selfValue[0] != 1 || selfValue[1] != 3) throw new System.Exception("mapper self identity");
foreach (var factory in new System.Func<System.Func<int, int>>[] { Index.intoUnknown, () => Index.mixed(input), Index.foreign }) {
    var first = factory();
    var second = factory();
    var alias = first;
    if (object.ReferenceEquals(first, second) || !object.ReferenceEquals(first, alias) || first(3) != 4) throw new System.Exception("unknown argument and alias identity");
}
if (object.ReferenceEquals(Index.returned(), Index.returned())) throw new System.Exception("returned stateless identity");
var retained = Index.retained(3);
var retainedOther = Index.retained(9);
if (retained() != 4 || retained() != 5 || retainedOther() != 10 || object.ReferenceEquals(retained, retainedOther)) throw new System.Exception("retained capture identity");
var original = new Tsonic.CSharp.Runtime.Error("original exception");
try { Index.failed(input, original); throw new System.Exception("missing exception"); }
catch (Tsonic.CSharp.Runtime.Error actual) { if (!object.ReferenceEquals(actual, original)) throw new System.Exception("exception identity"); }
foreach (var (generated, identity) in new (System.Func<JSArray<int>, JSArray<int>>, bool)[] {
    (Index.mapped, false), (Index.aliased, false), (Index.generic<int>, true),
}) {
    var result = generated(input);
    if (result.Count != 2 || result[0] != (identity ? 1 : 2) || result[1] != (identity ? 2 : 3) ||
        input[0] != 1 || input[1] != 2 || object.ReferenceEquals(result, input)) throw new System.Exception("exact input, callback result and fresh result");
    for (var iteration = 0; iteration < 10000; iteration++) {
        System.GC.KeepAlive(generated(input));
        System.GC.KeepAlive(Handwritten(input));
    }
    var before = System.GC.GetAllocatedBytesForCurrentThread();
    for (var iteration = 0; iteration < 10000; iteration++) System.GC.KeepAlive(generated(input));
    var generatedCost = System.GC.GetAllocatedBytesForCurrentThread() - before;
    before = System.GC.GetAllocatedBytesForCurrentThread();
    for (var iteration = 0; iteration < 10000; iteration++) System.GC.KeepAlive(Handwritten(input));
    var nativeCost = System.GC.GetAllocatedBytesForCurrentThread() - before;
    if (generatedCost != nativeCost) throw new System.Exception($"extra delegate allocation {generatedCost} != {nativeCost}");
}
for (var iteration = 0; iteration < 1000; iteration++) { Index.loop(input, 10); HandwrittenLoop(input, 10); }
var loopBefore = System.GC.GetAllocatedBytesForCurrentThread();
if (Index.loop(input, 10000) != 20000) throw new System.Exception("loop callback result");
var loopCost = System.GC.GetAllocatedBytesForCurrentThread() - loopBefore;
loopBefore = System.GC.GetAllocatedBytesForCurrentThread();
if (HandwrittenLoop(input, 10000) != 20000) throw new System.Exception("native loop result");
if (System.GC.GetAllocatedBytesForCurrentThread() - loopBefore != loopCost) throw new System.Exception("loop callback allocation");
static JSArray<int> Handwritten(JSArray<int> values) => JSArrayStatics.fromDense<int, int>(values, (value, _) => value + 1);
static int HandwrittenLoop(JSArray<int> values, int count) {
    var total = 0;
    for (var index = 0; index < count; index++) total += Handwritten(values)[0];
    return total;
}
`);
});

test("exact enclosing generic binders retain one invocation ABI through const aliases", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    export function genericAlias<T>(values: T[]): T[] {
      const mapper = (value: T): T => value;
      const alias = mapper;
      return Array.from(values, alias);
    }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  executeCsharpConstruction(compiled, "generic-alias-callable-creation", false, false, [], `
using Tsonic.CSharp.Js;
Verify(JSArray<int>.of([1, 2]));
Verify(JSArray<string>.of(["left", "right"]));
static void Verify<T>(JSArray<T> values) {
    var copied = Tsonic.Generated.Index.genericAlias(values);
    if (object.ReferenceEquals(copied, values) || copied.Count != values.Count ||
        !System.Collections.Generic.EqualityComparer<T>.Default.Equals(copied[0], values[0])) throw new System.Exception("exact generic copy contract");
    for (var iteration = 0; iteration < 10000; iteration++) {
        System.GC.KeepAlive(Tsonic.Generated.Index.genericAlias(values));
        System.GC.KeepAlive(Handwritten(values));
    }
    var before = System.GC.GetAllocatedBytesForCurrentThread();
    for (var iteration = 0; iteration < 10000; iteration++) System.GC.KeepAlive(Tsonic.Generated.Index.genericAlias(values));
    var generatedCost = System.GC.GetAllocatedBytesForCurrentThread() - before;
    before = System.GC.GetAllocatedBytesForCurrentThread();
    for (var iteration = 0; iteration < 10000; iteration++) System.GC.KeepAlive(Handwritten(values));
    var nativeCost = System.GC.GetAllocatedBytesForCurrentThread() - before;
    if (generatedCost != nativeCost) throw new System.Exception($"generic alias allocation {generatedCost} != {nativeCost}");
}
static JSArray<T> Handwritten<T>(JSArray<T> values) => JSArrayStatics.fromDense<T, T>(values, Identity<T>);
static T Identity<T>(T value, int index) => value;
`);
});

test("inline named recursion caches only invocation-only creation without weakening self or unknown identity", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    import type { int } from "@tsonic/csharp/types.js";
    export function recursive(values: int[]): int[] {
      return Array.from(values, function recurse(value: int, index: int): int {
        return value === 0 ? index : recurse(value - 1, index + 1);
      });
    }
    export function observed(values: int[]): int[] {
      return Array.from(values, function self(value: int, index: int): int {
        const alias = self;
        if (alias !== self) throw new Error("fixed mapper self identity");
        return value + index;
      });
    }
    function unknown(mapper: (value: int, index: int) => int): (value: int, index: int) => int { return mapper; }
    export function intoUnknown(): (value: int, index: int) => int {
      return unknown(function recurse(value: int, index: int): int {
        return value === 0 ? index : recurse(value - 1, index + 1);
      });
    }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  executeCsharpConstruction(compiled, "inline-named-argument-creation", false, false, [], `
using Tsonic.CSharp.Js;
using Index = Tsonic.Generated.Index;
var input = JSArray<int>.of([1, 2]);
var result = Index.recursive(input);
var observed = Index.observed(input);
if (result[0] != 1 || result[1] != 3 || observed[0] != 1 || observed[1] != 3) throw new System.Exception("native recursive and fixed-self callback behavior");
var first = Index.intoUnknown();
var alias = first;
var second = Index.intoUnknown();
if (object.ReferenceEquals(first, second) || !object.ReferenceEquals(first, alias) || first(3, 1) != 4) throw new System.Exception("unknown argument preserves fresh named callback identity");
for (var iteration = 0; iteration < 10000; iteration++) {
    System.GC.KeepAlive(Index.recursive(input));
    System.GC.KeepAlive(Handwritten(input));
}
var before = System.GC.GetAllocatedBytesForCurrentThread();
for (var iteration = 0; iteration < 10000; iteration++) System.GC.KeepAlive(Index.recursive(input));
var generatedCost = System.GC.GetAllocatedBytesForCurrentThread() - before;
before = System.GC.GetAllocatedBytesForCurrentThread();
for (var iteration = 0; iteration < 10000; iteration++) System.GC.KeepAlive(Handwritten(input));
if (generatedCost != System.GC.GetAllocatedBytesForCurrentThread() - before) throw new System.Exception("inline named recursive callback allocation");
static JSArray<int> Handwritten(JSArray<int> values) {
    static int Recurse(int value, int index) => value == 0 ? index : Recurse(value - 1, index + 1);
    return JSArrayStatics.fromDense<int, int>(values, Recurse);
}
`);
});
