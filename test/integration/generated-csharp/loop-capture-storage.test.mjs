import assert from "node:assert/strict";
import test from "node:test";
import { loopCaptureStorageSource } from "../../../../tsonic/test/fixtures/loop-capture-storage.mjs";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of ["native", "js"]) {
  test(`lexical loop activations retain copied and live captures in ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: loopCaptureStorageSource });
    assertCsharpCompilationSucceeded(compiled);
    assert.equal(/\bdynamic\b|Unsafe\.|Activator/u.test([...compiled.artifacts.values()].join("\n")), false);
    executeCsharpConstruction(compiled, `loop-capture-storage-${surface}`,
      false, false, [], "Tsonic.Generated.Index.main();");
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

  test(`inferred loop delegates compare original identities without invocation allocation in ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      export function create(): () => boolean {
        let selected = (): boolean => false;
        let previous: (() => number) | undefined;
        for (let index = 0; index < 2; index++) {
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
    const source = compiled.artifacts.get("src/Index.cs");
    assert.equal(typeof source, "string");
    assert.equal((source.match(/object\.ReferenceEquals\(/gu) ?? []).length, 4,
      "identity comparisons use original delegates rather than adapted values");
    if (surface === "native") {
      assert.match(source, /Func<int>/u, "inferred counted-loop result remains native integer");
      assert.match(source, /Func<double>/u, "authored callable contract retains its declared carrier");
    }
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
