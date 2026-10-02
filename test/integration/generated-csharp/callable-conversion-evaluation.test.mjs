import assert from "node:assert/strict";
import test from "node:test";
import { absenceCallableConversionSource, broadCallableConversionSource, broadAsyncCallableConversionSource, nativeCallableAdapterCostSource } from "../../../../tsonic/test/fixtures/callable-conversion-evaluation.mjs";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of [undefined, "js"]) {
  const lane = surface ?? "native";
  test(`stored and factory-produced absence callbacks bind once in ${lane}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: absenceCallableConversionSource });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `absence-callable-conversion-${lane}`);
  });
}

test("stored and factory-produced broad callbacks bind once on the JS surface", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: broadCallableConversionSource });
  assertCsharpCompilationSucceeded(compiled);
  executeCsharpConstruction(compiled, "broad-callable-conversion");
});

test("nested native callback adapters preserve captures without colliding names", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    let count = 0;
    type Slim = () => void;
    type Wide = (value: number) => unknown;
    export function run(): boolean {
      let original = (handler: Wide): void => { handler(9); };
      const converted: (handler: Slim) => unknown = original;
      original = (): void => { count += 100; };
      const result = converted(() => { count++; });
      original(value => value);
      return result === undefined && count === 101;
    }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  executeCsharpConstruction(compiled, "nested-callable-conversion");
});

test("native callable adapters invoke static, inline, captured and defaulted bodies without per-call allocation", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ sourceText: nativeCallableAdapterCostSource });
  assertCsharpCompilationSucceeded(compiled);
  const artifacts = new Map(compiled.artifacts);
  artifacts.set("generated/TsonicEntrypoint.cs", `
using Subject = Tsonic.Generated.Index;
var first = Subject.staticCallback();
var second = Subject.inlineCallback();
var third = Subject.capturedCallback(0);
var fourth = Subject.defaultCallback();
for (var index = 0; index < 10000; index++) { first(index); second(index); third(index); fourth(null); }
double result = 0;
var before = System.GC.GetAllocatedBytesForCurrentThread();
for (var index = 0; index < 10000; index++) { result += first(index) + second(index) + third(index) + fourth(null); }
var allocated = System.GC.GetAllocatedBytesForCurrentThread() - before;
if (result != 750065000 || allocated != 0) throw new System.Exception($"callable adapter allocation: {allocated}; result: {result}");
`);
  executeCsharpConstruction({ ...compiled, artifacts }, "native-callable-adapter-allocation");
});

for (const surface of [undefined, "js"]) {
  const lane = surface ?? "native";
  test(`broad async callbacks retain their producer Task and live captures in ${lane}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: broadAsyncCallableConversionSource });
    assertCsharpCompilationSucceeded(compiled);
    const output = [...compiled.artifacts].filter(([path]) => path.endsWith(".cs")).map(([, text]) => text).join("\n");
    assert.doesNotMatch(output, /\(\(Func<[^;]+\)\(async/su);
    executeCsharpConstruction(compiled, `broad-async-callable-conversion-${lane}`, true);
  });
}
