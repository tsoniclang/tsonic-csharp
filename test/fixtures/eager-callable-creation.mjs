export const eagerCallableCreationSource = `
  import type { int } from "@tsonic/csharp/types.js";
  export function mapped(values: int[]): int[] { return values.map((value): int => value + 1); }
  export function filtered(values: int[]): int[] { return values.filter(value => value > 0); }
  export function some(values: int[]): boolean { return values.some(value => value > 0); }
  export function every(values: int[]): boolean { return values.every(value => value > 0); }
  export function found(values: int[]): int | undefined { return values.find(value => value > 0); }
  export function last(values: int[]): int | undefined { return values.findLast(value => value > 0); }
  export function index(values: int[]): int { return values.findIndex(value => value > 0); }
  export function lastIndex(values: int[]): int { return values.findLastIndex(value => value > 0); }
  export function iterated(values: int[]): void { values.forEach(value => { if (value < 0) throw new Error("negative"); }); }
  export function reduced(values: number[]): number { return values.reduce((total, value) => total + value, 0); }
  export function sorted(values: int[]): int[] { return values.sort((left, right) => left - right); }
  export function readonlyMapped(values: readonly int[]): int[] { return values.map((value): int => value + 1); }
  export function mapIteration(values: Map<int, int>): void { values.forEach((value, key) => { if (value < key) throw new Error("ordered"); }); }
  export function readonlyMapIteration(values: ReadonlyMap<int, int>): void { values.forEach((value, key) => { if (value < key) throw new Error("ordered"); }); }
  export function setIteration(values: Set<int>): void { values.forEach((value, key) => { if (value !== key) throw new Error("same"); }); }
  export function readonlySetIteration(values: ReadonlySet<int>): void { values.forEach((value, key) => { if (value !== key) throw new Error("same"); }); }
  export function typedSorted(values: Float64Array): Float64Array { return values.sort((left, right) => left - right); }
  export function defaultSorted(values: int[]): int[] { return values.sort(); }
  export function defaultTypedSorted(values: Float64Array): Float64Array { return values.sort(); }
  export function aliased(values: int[]): int[] {
    const mapper = (value: int): int => value + 1;
    const alias = mapper;
    return values.map(alias);
  }
  export function grouped(values: int[]): int[] { return values.map(((value): int => value + 1)); }
  export function generic<T>(values: T[]): T[] {
    const mapper = (value: T): T => value;
    const alias = mapper;
    return values.map(alias);
  }
  export function captured(values: int[], step: int): int[] { return values.map((value): int => value + step); }
  export function mutated(values: int[]): int[] {
    let step: int = 0;
    const result = values.map((value): int => value + ++step);
    if (step !== values.length) throw new Error("captured mutation");
    return result;
  }
  export function observed(values: int[]): (value: int) => int {
    const mapper = (value: int): int => value + 1;
    const alias = mapper;
    values.map(alias);
    if (mapper !== alias) throw new Error("alias identity");
    return mapper;
  }
  function unknown(mapper: (value: int) => int): (value: int) => int { return mapper; }
  export function mixed(values: int[]): (value: int) => int {
    const mapper = (value: int): int => value + 1;
    values.map(mapper);
    return unknown(mapper);
  }
  export function returned(): (value: int) => int { return (value: int): int => value + 1; }
  export function selfValue(values: int[]): int[] {
    return values.map(function self(value: int): int {
      const alias = self;
      if (alias !== self) throw new Error("self identity");
      return value + 1;
    });
  }
  export function failed(values: int[], error: Error): int[] {
    return values.map((_value): int => { throw error; });
  }
`;

export const eagerCallableCreationNativeProof = `
using Tsonic.CSharp.Js;
using Index = Tsonic.Generated.Index;
var input = JSArray<int>.of([1, 2]);
var numbers = JSArray<double>.of([1, 2]);
var map = new Map<int, int>();
map.set(1, 2);
var set = new Set<int>();
set.add(1);
var typed = new Float64Array(2);
typed[0] = 1;
typed[1] = 2;
VerifyCost("map", () => System.GC.KeepAlive(Index.mapped(input)), () => System.GC.KeepAlive(input.map((value, _, _) => value + 1)));
VerifyCost("map readonly", () => System.GC.KeepAlive(Index.readonlyMapped(input)), () => System.GC.KeepAlive(input.map((value, _, _) => value + 1)));
VerifyCost("map alias", () => System.GC.KeepAlive(Index.aliased(input)), () => System.GC.KeepAlive(input.map((value, _, _) => value + 1)));
VerifyCost("map grouped", () => System.GC.KeepAlive(Index.grouped(input)), () => System.GC.KeepAlive(input.map((value, _, _) => value + 1)));
VerifyCost("map generic", () => System.GC.KeepAlive(Index.generic(input)), () => System.GC.KeepAlive(input.map(Identity<int>)));
VerifyCost("filter", () => System.GC.KeepAlive(Index.filtered(input)), () => System.GC.KeepAlive(input.filter((value, _, _) => value > 0)));
VerifyCost("some", () => { if (!Index.some(input)) throw new System.Exception("some"); }, () => { if (!input.some((value, _, _) => value > 0)) throw new System.Exception("some native"); });
VerifyCost("every", () => { if (!Index.every(input)) throw new System.Exception("every"); }, () => { if (!input.every((value, _, _) => value > 0)) throw new System.Exception("every native"); });
VerifyCost("find", () => { if (Index.found(input) != 1) throw new System.Exception("find"); }, () => { if (Tsonic.CSharp.Js.Array.findValue(input, (value, _, _) => value > 0) != 1) throw new System.Exception("find native"); });
VerifyCost("findLast", () => { if (Index.last(input) != 2) throw new System.Exception("findLast"); }, () => { if (Tsonic.CSharp.Js.Array.findLastValue(input, (value, _, _) => value > 0) != 2) throw new System.Exception("findLast native"); });
VerifyCost("findIndex", () => { if (Index.index(input) != 0) throw new System.Exception("findIndex"); }, () => { if (input.findIndex((value, _, _) => value > 0) != 0) throw new System.Exception("findIndex native"); });
VerifyCost("findLastIndex", () => { if (Index.lastIndex(input) != 1) throw new System.Exception("findLastIndex"); }, () => { if (input.findLastIndex((value, _, _) => value > 0) != 1) throw new System.Exception("findLastIndex native"); });
VerifyCost("forEach", () => Index.iterated(input), () => input.forEach((value, _, _) => { if (value < 0) throw new Tsonic.CSharp.Runtime.Error("negative"); }));
VerifyCost("reduce", () => { if (Index.reduced(numbers) != 3) throw new System.Exception("reduce"); }, () => { if (numbers.reduce((total, value, _, _) => total + value, 0.0) != 3) throw new System.Exception("reduce native"); });
VerifyCost("sort", () => System.GC.KeepAlive(Index.sorted(input)), () => System.GC.KeepAlive(input.sort((left, right) => left - right)));
VerifyCost("Map.forEach", () => Index.mapIteration(map), () => map.forEach((value, key, _) => { if (value < key) throw new Tsonic.CSharp.Runtime.Error("ordered"); }));
VerifyCost("ReadonlyMap.forEach", () => Index.readonlyMapIteration(map), () => map.forEach((value, key, _) => { if (value < key) throw new Tsonic.CSharp.Runtime.Error("ordered"); }));
VerifyCost("Set.forEach", () => Index.setIteration(set), () => set.forEach((value, key, _) => { if (value != key) throw new Tsonic.CSharp.Runtime.Error("same"); }));
VerifyCost("ReadonlySet.forEach", () => Index.readonlySetIteration(set), () => set.forEach((value, key, _) => { if (value != key) throw new Tsonic.CSharp.Runtime.Error("same"); }));
VerifyCost("TypedArray.sort", () => System.GC.KeepAlive(Index.typedSorted(typed)), () => System.GC.KeepAlive(typed.sort((left, right) => left - right)));
if (!object.ReferenceEquals(Index.defaultSorted(input), input) || !object.ReferenceEquals(Index.defaultTypedSorted(typed), typed)) throw new System.Exception("default comparator selection");
var changed = Index.captured(input, 3);
var changedOther = Index.captured(input, 7);
if (changed[0] != 4 || changedOther[0] != 8 || changed[0] != 4) throw new System.Exception("fresh capture activations");
var mutated = Index.mutated(input);
if (mutated[0] != 2 || mutated[1] != 4) throw new System.Exception("live shared mutation");
foreach (var factory in new System.Func<System.Func<int, int>>[] { () => Index.observed(input), () => Index.mixed(input), Index.returned }) {
    var first = factory();
    var alias = first;
    var second = factory();
    if (object.ReferenceEquals(first, second) || !object.ReferenceEquals(first, alias) || first(3) != 4) throw new System.Exception("observable/unknown callback identity");
}
var self = Index.selfValue(input);
if (self[0] != 2 || self[1] != 3) throw new System.Exception("self identity");
VerifyCost("observed named self", () => System.GC.KeepAlive(Index.selfValue(input)), () => System.GC.KeepAlive(NativeSelf(input)));
var error = new Tsonic.CSharp.Runtime.Error("original");
try { Index.failed(input, error); throw new System.Exception("expected exception"); }
catch (Tsonic.CSharp.Runtime.Error actual) { if (!object.ReferenceEquals(actual, error)) throw new System.Exception("exception identity"); }
VerifyGeneric(JSArray<string>.of(["left", "right"]));
static void VerifyGeneric<T>(JSArray<T> values) {
    var result = Index.generic(values);
    if (result.Count != values.Count || object.ReferenceEquals(result, values) || !System.Collections.Generic.EqualityComparer<T>.Default.Equals(result[0], values[0])) throw new System.Exception("exact inherited generic binder");
    VerifyCost("map generic reference", () => System.GC.KeepAlive(Index.generic(values)), () => System.GC.KeepAlive(values.map(Identity<T>)));
}
static T Identity<T>(T value, int index, JSArray<T> values) => value;
static JSArray<int> NativeSelf(JSArray<int> values) {
    System.Func<int, int> self = null!;
    int Self(int value) {
        var alias = self;
        if (!object.ReferenceEquals(alias, self)) throw new Tsonic.CSharp.Runtime.Error("self identity");
        return value + 1;
    }
    self = new System.Func<int, int>(Self);
    return values.map((value, _, _) => self(value));
}
static void VerifyCost(string name, System.Action generated, System.Action native) {
    for (var warmup = 0; warmup < 10000; warmup++) { generated(); native(); }
    var before = System.GC.GetAllocatedBytesForCurrentThread();
    for (var iteration = 0; iteration < 10000; iteration++) generated();
    var generatedCost = System.GC.GetAllocatedBytesForCurrentThread() - before;
    before = System.GC.GetAllocatedBytesForCurrentThread();
    for (var iteration = 0; iteration < 10000; iteration++) native();
    var nativeCost = System.GC.GetAllocatedBytesForCurrentThread() - before;
    if (generatedCost != nativeCost) throw new System.Exception($"{name}: avoidable allocation {generatedCost} != {nativeCost}");
    System.Console.WriteLine($"{name}: {generatedCost} == {nativeCost}");
}
`;
