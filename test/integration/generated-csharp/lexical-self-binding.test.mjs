import assert from "node:assert/strict";
import test from "node:test";
import { lexicalSelfBindingSource } from "../../../../tsonic/test/fixtures/lexical-self-binding.mjs";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of ["native", "js"]) {
  test(`fixed self and written lexical bindings retain distinct native identities in ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: lexicalSelfBindingSource });
    assertCsharpCompilationSucceeded(compiled);
    assert.doesNotMatch(compiled.artifacts.get("src/Index.cs"), /\boriginal\(/u);
    executeCsharpConstruction(compiled, `lexical-self-binding-${surface}`,
      false, false, [], "Tsonic.Generated.Index.main();");
  });

  test(`named self values retain one fixed identity per creation in ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      export function create(seed: number): (count: number) => number {
        return function original(count: number): number {
          const same = original;
          const deferred = (): boolean => same === original;
          if (!deferred()) return -1;
          return count === 0 ? seed : original(count - 1);
        };
      }
      export function main(): void {
        const first = create(7);
        const second = create(11);
        if (first === second || first(3) !== 7 || second(2) !== 11) throw new Error("named self identity");
        let saved: ((count: number) => number) | null = null;
        const observable = function original(count: number): number { saved = original; return count; };
        if (observable(5) !== 5 || saved !== observable) throw new Error("observable named self identity");
      }
    ` });
    executeCsharpConstruction(compiled, `named-self-value-identity-${surface}`,
      false, false, [], "Tsonic.Generated.Index.main();");
  });

  test(`nested fixed self retains shared captured mutation without an uninitialized self field in ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      export function run(): boolean {
        let total = 0;
        const observer = { read(): number { return total; } };
        let selected = function original(count: number): number {
          const next = (): number => { total += 1; return original(count - 1); };
          return count === 0 ? total : next();
        };
        const before = selected;
        selected = (): number => 99;
        return before(3) === 3 && observer.read() === 3 && selected(1) === 99;
      }
      export function main(): void {
        if (!run()) throw new Error("nested named self and shared mutation");
      }
    ` });
    executeCsharpConstruction(compiled, `nested-named-self-${surface}`,
      false, false, [], "Tsonic.Generated.Index.main();");
  });
}

test("calls-only named self uses handwritten delegate allocation and allocation-free recursion", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ sourceText: `
    export function create(): (count: number) => number {
      return function original(count: number): number {
        return count === 0 ? 1 : original(count - 1);
      };
    }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  const source = compiled.artifacts.get("src/Index.cs");
  assert.doesNotMatch(source, /__TsonicCapture_/u);
  executeCsharpConstruction(compiled, "named-self-native-cost", false, false, [], `
static System.Func<double, double> NativeCreate() {
    static double Original(double count) { return count == 0 ? 1 : Original(count - 1); }
    return new System.Func<double, double>(Original);
}
for (var index = 0; index < 100; index++) {
    Tsonic.Generated.Index.create(); NativeCreate();
}
var before = System.GC.GetAllocatedBytesForCurrentThread();
var actual = Tsonic.Generated.Index.create();
var actualBytes = System.GC.GetAllocatedBytesForCurrentThread() - before;
before = System.GC.GetAllocatedBytesForCurrentThread();
var expected = NativeCreate();
var nativeBytes = System.GC.GetAllocatedBytesForCurrentThread() - before;
if (actualBytes != nativeBytes) throw new System.Exception("named self differs from handwritten delegate allocation");
var another = Tsonic.Generated.Index.create();
if (object.ReferenceEquals(actual, another)) throw new System.Exception("named function creation identity reused");
before = System.GC.GetAllocatedBytesForCurrentThread();
for (var index = 0; index < 10000; index++) {
    if (actual(3) != 1) throw new System.Exception("named self recursive result");
}
if (System.GC.GetAllocatedBytesForCurrentThread() != before) throw new System.Exception("named self recursion allocation");
System.GC.KeepAlive(actual);
System.GC.KeepAlive(expected);
`);
});
