import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

const sourceText = `
  import type { int64 } from "@tsonic/core/types.js";
  let effects = 0;
  let failDefault = false;
  function effectCount(): number { return effects; }
  function leftDefault(): int64 { effects += 1; return 9007199254740993n; }
  function rightDefault(): int64 {
    effects += 10;
    if (failDefault) throw new Error("chosen default");
    return -9007199254740993n;
  }
  export class Left {
    value(input: int64 = leftDefault()): int64 { return input; }
    identity<Value>(value: Value): Value { return value; }
    select<Key, Value>(key: Key, value: Value): Value { return value; }
  }
  export class Right {
    value(input: int64 = rightDefault()): int64 { return input; }
    identity<Value>(value: Value): Value { return value; }
    select<Input, Output>(key: Input, value: Output): Output { return value; }
  }
  type Choice = Left | Right;
  export function first(): Left { return new Left(); }
  export function second(): Right { return new Right(); }
  export function present(value: Choice, input: int64): int64 { return value.value(input); }
  function omitted(value: Choice): int64 { return value.value(); }
  function absent(value: Choice): int64 { return value.value(undefined); }
  function identity<Value>(receiver: Choice, value: Value): Value { return receiver.identity<Value>(value); }
  function select<Key, Value>(receiver: Choice, key: Key, value: Value): Value { return receiver.select<Key, Value>(key, value); }
  export function run(): boolean {
    const left = first();
    const right = second();
    if (present(left, 0n) !== 0n || present(right, 9007199254740993n) !== 9007199254740993n || effectCount() !== 0) return false;
    if (omitted(left) !== 9007199254740993n || effectCount() !== 1) return false;
    if (absent(right) !== -9007199254740993n || effectCount() !== 11) return false;
    if (identity<int64>(left, 9007199254740993n) !== 9007199254740993n || identity<int64>(right, -9007199254740993n) !== -9007199254740993n) return false;
    if (select<int64, string>(left, 9007199254740993n, "first") !== "first" ||
      select<string, int64>(right, "second", -9007199254740993n) !== -9007199254740993n) return false;
    failDefault = true;
    if (present(right, 0n) !== 0n || effectCount() !== 11) return false;
    let caught = false;
    try { omitted(right); } catch { caught = true; }
    return caught && effectCount() === 21 && present(right, 0n) === 0n;
  }
`;

for (const surface of [undefined, "js"]) {
  test(`native class-union defaults retain exact int64 carriers and no dispatch allocations (${surface ?? "native"})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText });
    const generated = [...compiled.artifacts.values()].join("\n");
    assert.equal(/value\(long\? \w+ = null\)/u.test(generated), true, "native default incoming long?");
    assert.equal(/private static long __tsonic_union_call_/u.test(generated), true, "closed static dispatcher");
    assert.equal(/\.Match\(|DynamicInvoke|System\.Reflection|Func<|\(double\)\s*(?:input|argument\d+|__tsonic_param\d+)/u.test(generated), false,
      "no dispatch closures, reflection or float round trip");
    const output = executeCsharpConstruction(compiled, `native-union-incoming-${surface ?? "native"}`, false, false, [], `
      if (!Tsonic.Generated.Index.run()) throw new System.Exception("native defaults and generic values");
      var left = Tsonic.Generated.Index.first();
      var right = Tsonic.Generated.Index.second();
      Tsonic.CSharp.Runtime.Union<Tsonic.Generated.Left, Tsonic.Generated.Right> leftReceiver = left;
      Tsonic.CSharp.Runtime.Union<Tsonic.Generated.Left, Tsonic.Generated.Right> rightReceiver = right;
      long checksum = 0;
      for (int index = 0; index < 10000; index++) {
        checksum += Tsonic.Generated.Index.present(leftReceiver, index);
        checksum += Tsonic.Generated.Index.present(rightReceiver, index);
        checksum += Direct(leftReceiver, index);
        checksum += Direct(rightReceiver, index);
      }
      var before = System.GC.GetAllocatedBytesForCurrentThread();
      for (int index = 0; index < 10000; index++) {
        checksum += Tsonic.Generated.Index.present(leftReceiver, index);
        checksum += Tsonic.Generated.Index.present(rightReceiver, index);
      }
      var generatedCost = System.GC.GetAllocatedBytesForCurrentThread() - before;
      before = System.GC.GetAllocatedBytesForCurrentThread();
      for (int index = 0; index < 10000; index++) {
        checksum += Direct(leftReceiver, index);
        checksum += Direct(rightReceiver, index);
      }
      var nativeCost = System.GC.GetAllocatedBytesForCurrentThread() - before;
      if (generatedCost != nativeCost || generatedCost != 0 || checksum != 399960000L)
        throw new System.Exception($"native dispatcher cost {generatedCost}:{nativeCost}:{checksum}");
      System.Console.WriteLine($"union allocation {generatedCost}:{nativeCost}");
      static long Direct(Tsonic.CSharp.Runtime.Union<Tsonic.Generated.Left, Tsonic.Generated.Right> receiver, long input) {
        if (receiver.Is1()) return receiver.As1().value(input);
        return receiver.As2().value(input);
      }
    `);
    assert.match(output, /union allocation 0:0/u);
  });
}
