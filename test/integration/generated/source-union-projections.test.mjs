import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpNativeUseSource } from "../../helpers/expected-native-uses.mjs";
import { assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of ["native", "js"]) {
  test(`${surface} an optional generic argument preserves absence inside its original role`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpNativeUseSource({ surface, sourceText: `
      function inject<T>(value: T): string | T { return value; }
      export function run(value: number | undefined): string | number | undefined {
        return inject<number | undefined>(value);
      }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    const emitted = [...compiled.artifacts].filter(([path]) => path.endsWith(".cs")).map(([, text]) => text).join("\n");
    assert.equal(/\bobject\b|\bdynamic\b|\.Select\(|\.ToArray\(/u.test(emitted), false,
      "optional role closure introduces no boxed carrier repair or copying");
    const output = executeCsharpConstruction(compiled, `source-union-optional-argument-${surface}`, false, false, [], `
      var number = Tsonic.Generated.Index.run(17.5D);
      if (number is null || !number.Value.Is2() || number.Value.As2() != 17.5D)
          throw new System.Exception("optional argument number");
      if (Tsonic.Generated.Index.run(null) is not null)
          throw new System.Exception("absence belongs to the original generic role");
      for (var index = 0; index < 4096; index++) Tsonic.Generated.Index.run(17.5D);
      var before = System.GC.GetAllocatedBytesForCurrentThread();
      var sum = 0D;
      for (var index = 0; index < 65536; index++) sum += Tsonic.Generated.Index.run(17.5D)!.Value.As2();
      if (sum != 65536D * 17.5D || System.GC.GetAllocatedBytesForCurrentThread() - before != 0)
          throw new System.Exception("optional argument native cost");
      System.Console.WriteLine("optional argument role passed");`);
    assert.equal(output.includes("optional argument role passed"), true,
      "an absence introduced by the actual generic application remains part of its exact static role");
  });

  test(`${surface} optional Source families retain their original absence role and scalar closure`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpNativeUseSource({ surface, sourceText: `
      function maybe<T>(value: T | undefined): string | T | undefined { return value; }
      export function numeric(value: number | undefined): string | number | undefined { return maybe<number>(value); }
      export function text(value: string | undefined): string | undefined { return maybe<string>(value); }
      export function empty(): string | number | undefined { return maybe<number>(undefined); }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    const output = executeCsharpConstruction(compiled, `source-union-optional-roles-${surface}`, false, false, [], `
      var numeric = Tsonic.Generated.Index.numeric(17.5D);
      if (numeric is null || !numeric.Value.Is2() || numeric.Value.As2() != 17.5D)
          throw new System.Exception("optional number role");
      if (Tsonic.Generated.Index.numeric(null) is not null || Tsonic.Generated.Index.empty() is not null)
          throw new System.Exception("one absence state");
      var text = new string('x', 3);
      if (!object.ReferenceEquals(Tsonic.Generated.Index.text(text), text) || Tsonic.Generated.Index.text(null) is not null)
          throw new System.Exception("optional coincident reference identity");
      for (var index = 0; index < 4096; index++) Tsonic.Generated.Index.numeric(17.5D);
      var before = System.GC.GetAllocatedBytesForCurrentThread();
      var total = 0D;
      for (var index = 0; index < 65536; index++) total += Tsonic.Generated.Index.numeric(17.5D)!.Value.As2();
      if (total != 65536D * 17.5D || System.GC.GetAllocatedBytesForCurrentThread() - before != 0)
          throw new System.Exception("optional role native cost");
      System.Console.WriteLine("optional Source roles passed");`);
    assert.equal(output.includes("optional Source roles passed"), true,
      "the same original optional family preserves native absence identity and zero hot allocation");
  });

  test(`${surface} nested open components keep distinct coincident and partial physical roles`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpNativeUseSource({ surface, sourceText: `
      import type { int32 } from "@tsonic/core/types.js";
      function nested<T>(value: string | (T | number)): string | (T | number) { return value; }
      function partial<U>(value: string | number | U): string | number | U { return nested<U>(value); }
      export function fromNumber(value: number): string | number { return nested<number>(value); }
      export function fromText(value: string): string | number { return nested<string>(value); }
      export function fromInt(value: int32): string | number | int32 { return partial<int32>(value); }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    const emitted = [...compiled.artifacts].filter(([path]) => path.endsWith(".cs")).map(([, text]) => text).join("\n");
    assert.equal(emitted.includes("ISourceUnion3"), true,
      "the canonical open template's three components retain three static original roles");
    assert.equal(/\bobject\b|\bdynamic\b|\.Select\(|\.ToArray\(/u.test(emitted), false,
      "partial closure adds no boxing array repair or dynamic carrier");
    const output = executeCsharpConstruction(compiled, `source-union-nested-roles-${surface}`, false, false, [], `
      var number = Tsonic.Generated.Index.fromNumber(17.5D);
      if (!number.Is2() || number.As2() != 17.5D) throw new System.Exception("coincident number roles");
      var text = new string('x', 3);
      var selected = Tsonic.Generated.Index.fromText(text);
      if (!selected.Is1() || !object.ReferenceEquals(selected.As1(), text)) throw new System.Exception("coincident text roles");
      var integer = Tsonic.Generated.Index.fromInt(17);
      if (!integer.Is2() || integer.As2() != 17) throw new System.Exception("partial role order");
      for (var index = 0; index < 4096; index++) Tsonic.Generated.Index.fromNumber(17.5D);
      var before = System.GC.GetAllocatedBytesForCurrentThread();
      var sum = 0D;
      for (var index = 0; index < 65536; index++) sum += Tsonic.Generated.Index.fromNumber(17.5D).As2();
      var allocated = System.GC.GetAllocatedBytesForCurrentThread() - before;
      if (sum != 65536D * 17.5D || allocated != 0) throw new System.Exception("nested role native cost");
      System.Console.WriteLine("nested roles passed");`);
    assert.equal(output.includes("nested roles passed"), true,
      "actual nested partial and coincident closed witnesses execute without additional allocation");
  });

  test(`${surface} generic Source union construction and scalar coincidence execute through one static witness`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpNativeUseSource({ surface, sourceText: `
      function inject<T>(value: T): string | T { return value; }
      function forward<T>(value: string | T): string | T { return value; }
      export function numeric(value: number): string | number { return forward<number>(inject<number>(value)); }
      export function coincident(value: string): string { return forward<string>(inject<string>(value)); }
      export function callback(value: number): string | number {
        const make = (): string | number => inject<number>(value);
        return make();
      }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    const emitted = [...compiled.artifacts].filter(([path]) => path.endsWith(".cs")).map(([, text]) => text).join("\n");
    assert.equal(emitted.includes("ISourceUnion2"), true, "generic native methods retain their constrained static operation witness");
    const output = executeCsharpConstruction(compiled, `source-union-scalar-role-${surface}`, false, false, [], `
      var numeric = Tsonic.Generated.Index.numeric(17.5D);
      if (!numeric.Is2() || numeric.As2() != 17.5D) throw new System.Exception("number role");
      var text = new string('x', 3);
      if (!object.ReferenceEquals(Tsonic.Generated.Index.coincident(text), text)) throw new System.Exception("coincident identity");
      var callback = Tsonic.Generated.Index.callback(19.5D);
      if (!callback.Is2() || callback.As2() != 19.5D) throw new System.Exception("callback role");
      for (var index = 0; index < 4096; index++) Tsonic.Generated.Index.numeric(17.5D);
      var before = System.GC.GetAllocatedBytesForCurrentThread();
      var sum = 0D;
      for (var index = 0; index < 65536; index++) sum += Tsonic.Generated.Index.numeric(17.5D).As2();
      var allocated = System.GC.GetAllocatedBytesForCurrentThread() - before;
      if (sum != 65536D * 17.5D || allocated != 0) throw new System.Exception("generic role cost");
      System.Console.WriteLine("generic scalar roles passed");`);
    assert.equal(output.includes("generic scalar roles passed"), true,
      "real generic construction closure preserves scalar identity and has no boxing or allocation");
  });

  test(`${surface} authored generic Source union roles compose and collapse without a repair copy`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpNativeUseSource({ surface, sourceText: `
      import type { int32 } from "@tsonic/core/types.js";
      function inject<T>(value: T): string | T { return value; }
      function forward<T>(value: string | T): string | T { return value; }
      function partial<U>(value: U): string | number | U { return inject<number | U>(value); }
      export function numeric(value: number): string | number { return forward<number>(inject<number>(value)); }
      export function coincident(value: string): string { return forward<string>(inject<string>(value)); }
      export function composed(value: int32): string | number | int32 { return partial<int32>(value); }
      export function callback(value: number): string | number {
        const make = (): string | number => inject<number>(value);
        return make();
      }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    const emitted = [...compiled.artifacts].filter(([path]) => path.endsWith(".cs")).map(([, text]) => text).join("\n");
    assert.equal(emitted.includes("ISourceUnion2"), true, "generic method operations use their exact static physical witness");
    assert.equal(/\bobject\b|\bdynamic\b|\.Select\(|\.ToArray\(/u.test(emitted), false,
      "Source role closure does not manufacture boxed storage adapters or array copies");
    const output = executeCsharpConstruction(compiled, `source-union-role-${surface}`, false, false, [], `
      var numeric = Tsonic.Generated.Index.numeric(17.5D);
      if (!numeric.Is2() || numeric.As2() != 17.5D) throw new System.Exception("number role");
      var text = new string('x', 3);
      if (!object.ReferenceEquals(Tsonic.Generated.Index.coincident(text), text)) throw new System.Exception("coincident identity");
      var composed = Tsonic.Generated.Index.composed(23);
      if (!composed.Is3() || composed.As3() != 23) throw new System.Exception("partial role");
      var callback = Tsonic.Generated.Index.callback(19.5D);
      if (!callback.Is2() || callback.As2() != 19.5D) throw new System.Exception("callback role");
      for (var index = 0; index < 4096; index++) Tsonic.Generated.Index.numeric(17.5D);
      var before = System.GC.GetAllocatedBytesForCurrentThread();
      var sum = 0D;
      for (var index = 0; index < 65536; index++) sum += Tsonic.Generated.Index.numeric(17.5D).As2();
      var allocated = System.GC.GetAllocatedBytesForCurrentThread() - before;
      if (sum != 65536D * 17.5D || allocated != 0) throw new System.Exception("generic role cost");
      System.Console.WriteLine("generic Source roles passed");`);
    assert.equal(output.includes("generic Source roles passed"), true,
      "the actual emitted generic partial coincident and callback operations execute with exact native cost");
  });
}
