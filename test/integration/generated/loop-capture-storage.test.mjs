import assert from "node:assert/strict";
import test from "node:test";
import { loopCaptureStorageSource } from "../../../../tsonic/test/fixtures/loop-capture-storage.mjs";
import { observableCallableCreationSource } from "../../../../tsonic/test/fixtures/observable-callable-creation.mjs";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of ["native", "js"]) {
  test(`observable callable creations retain fresh native identities in ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: observableCallableCreationSource });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `observable-callable-creation-${surface}`, false, false, [], `
if (!Tsonic.Generated.Index.run()) throw new System.Exception("native creation identity");
var read = Tsonic.Generated.Index.createStateless();
for (var warmup = 0; warmup < 100; warmup++) {
    if (read() != 7) throw new System.Exception("native callable result");
}
var before = System.GC.GetAllocatedBytesForCurrentThread();
for (var iteration = 0; iteration < 10000; iteration++) {
    if (read() != 7) throw new System.Exception("native callable result");
}
if (System.GC.GetAllocatedBytesForCurrentThread() != before) throw new System.Exception("native invocation allocation");
System.GC.KeepAlive(read);
`);
  });

  // headerEvaluation declares loop bindings named 'index' inside a function body that also declares 'let index': C#
  // CS0136. PORT-MAP (names/plan.ts): authored values keep their spelling and native CS0136 collisions reject before
  // sealing (RULINGS 2026-10-23), so the C# target refuses each nested binding and publishes nothing.
  test(`lexical loop activations refuse C# CS0136 binding collisions before publication in ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: loopCaptureStorageSource });
    assert.equal(compiled.sourceDiagnosticsText, "");
    assert.deepEqual(compiled.result.diagnostics.map(({ code, message }) => ({ code, message })), Array.from({ length: 2 }, () => ({
      code: "CSHARP_INVALID_IDENTIFIER",
      message: "Authored binding 'index' conflicts with an enclosing C# local declaration space (CS0136); its spelling cannot be changed.",
    })));
    assert.equal(compiled.artifacts.size, 0);
  });

  test(`repeated named-self creation within one live activation remains distinct in ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      export function run(): boolean {
        let previous: ((count: number) => number) | undefined;
        outer: for (let index = 0; index < 6; index++) {
          let repetition = 0;
          while (repetition < 2) {
            const current = function self(count: number): number {
              const same = self;
              const identity = (): boolean => same === self;
              if (!identity()) return -1;
              return count === 0 ? index : self(count - 1);
            };
            if (previous !== undefined && (previous(2) !== (repetition === 0 ? index - 1 : index) || previous === current)) return false;
            previous = current;
            repetition += 1;
          }
          try { continue outer; } finally { index += 1; }
        }
        return previous !== undefined && previous(2) === 5;
      }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    const source = compiled.artifacts.get("src/Index.cs");
    assert.equal(typeof source, "string");
    assert.equal((source.match(/new Func<double, double>\(__tsonic_self_\d+\)/gu) ?? []).length, 1,
      "one delegate allocation site per authored creation, never a frame cache");
    executeCsharpConstruction(compiled, `loop-named-self-multiple-creations-${surface}`);
  });

  test(`native-width loop delegates compare original identities without invocation allocation in ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      import type { int32 } from "@tsonic/core/types.js";
      export function create(): () => boolean {
        let selected = (): boolean => false;
        let previous: (() => number) | undefined;
        for (let index: int32 = 0; index < 2; index++) {
          const read = () => index;
          const alias = read;
          const before = previous;
          selected = (): boolean => alias === read && read === alias &&
            before !== undefined && before !== read && read !== before &&
            before() === index - 1 && read() === index;
          previous = read;
        }
        return selected;
      }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    const source = [...compiled.artifacts].filter(([path]) => path.endsWith(".cs"))
      .map(([, text]) => text).join("\n");
    assert.equal((source.match(/object\.ReferenceEquals\(/gu) ?? []).length, 4,
      "identity comparisons use original delegates rather than adapted values");
    assert.match(source, /Func<int>/u, "selected native-width result remains integer on every surface");
    assert.match(source, /Func<double>/u, "authored callable contract retains its declared carrier");
    executeCsharpConstruction(compiled, `loop-inferred-delegate-identity-cost-${surface}`, false, false, [], `
var verify = Tsonic.Generated.Index.create();
for (var warmup = 0; warmup < 100; warmup++) {
    if (!verify()) throw new System.Exception("captured delegate identity");
}
var before = System.GC.GetAllocatedBytesForCurrentThread();
for (var iteration = 0; iteration < 10000; iteration++) {
    if (!verify()) throw new System.Exception("captured delegate identity");
}
if (System.GC.GetAllocatedBytesForCurrentThread() != before) throw new System.Exception("identity comparison allocation");
System.GC.KeepAlive(verify);
`);
  });
}

test("retained loop named-self recursion uses its original live frame without per-call allocation", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ sourceText: `
    export function create(): (count: number) => number {
      let selected = (count: number): number => -1;
      for (let index = 0; index < 6; index++) {
        selected = function self(count: number): number {
          const same = self;
          if (same !== self) return -1;
          return count === 0 ? index : self(count - 1);
        };
        index += 1;
      }
      return selected;
    }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  executeCsharpConstruction(compiled, "loop-named-self-recursion-cost", false, false, [], `
var first = Tsonic.Generated.Index.create();
var second = Tsonic.Generated.Index.create();
if (object.ReferenceEquals(first, second)) throw new System.Exception("creation identity reused");
for (var warmup = 0; warmup < 100; warmup++) {
    if (first(3) != 5 || second(3) != 5) throw new System.Exception("retained frame read");
}
var before = System.GC.GetAllocatedBytesForCurrentThread();
for (var iteration = 0; iteration < 10000; iteration++) {
    if (first(3) != 5) throw new System.Exception("recursive retained frame read");
}
if (System.GC.GetAllocatedBytesForCurrentThread() != before) throw new System.Exception("recursive invocation allocation");
System.GC.KeepAlive(first);
System.GC.KeepAlive(second);
`);
});
