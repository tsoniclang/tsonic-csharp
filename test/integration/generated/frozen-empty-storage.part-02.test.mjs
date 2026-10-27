import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { frozenEmptyStorageSources, frozenEmptyStorageOpenSources, frozenEmptyStorageCrossFileSources } from "../../../../tsonic/test/fixtures/frozen-empty-storage.mjs";
import { generatedText, openSources } from "./frozen-empty-storage.fixtures.mjs";

test("empty freeze preserves checked absent-path refinement and evaluates operands once", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: frozenEmptyStorageSources[7][1] });
  assertCsharpCompilationSucceeded(compiled);
  assert.doesNotMatch(generatedText(compiled), /FrozenObject|ConditionalWeakTable/);
  executeCsharpConstruction(compiled, "frozen-empty-refined-absence");
});

test("cross-file object signatures retain exact closed EmptyObject origins", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: frozenEmptyStorageCrossFileSources["index.ts"],
    files: { "retain.ts": frozenEmptyStorageCrossFileSources["retain.ts"] } });
  assertCsharpCompilationSucceeded(compiled);
  assert.doesNotMatch(generatedText(compiled), /FrozenObject|ConditionalWeakTable|dynamic\b|Unsafe\./);
  executeCsharpConstruction(compiled, "frozen-empty-cross-file");
});

test("repeated empty freeze matches handwritten native allocation with no additional state", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    export function run(): boolean {
      const value: object = {};
      let frozen = false;
      for (let iteration = 0; iteration < 20000; iteration += 1) {
        Object.freeze(value);
        frozen = Object.isFrozen(value);
      }
      return frozen;
    }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  assert.doesNotMatch(generatedText(compiled), /FrozenObject|ConditionalWeakTable|TsValue|dynamic\b/);
  const output = executeCsharpConstruction(compiled, "frozen-empty-native-allocation", false, false, [], `
    static bool Handwritten() {
      var value = new Tsonic.CSharp.Runtime.EmptyObject();
      var frozen = false;
      for (var iteration = 0; iteration < 20000; iteration += 1) {
        Tsonic.CSharp.Runtime.EmptyObject.Freeze(value);
        frozen = Tsonic.CSharp.Runtime.EmptyObject.IsFrozen(value);
      }
      return frozen;
    }
    Tsonic.Generated.Index.run();
    Handwritten();
    var before = System.GC.GetAllocatedBytesForCurrentThread();
    var generated = Tsonic.Generated.Index.run();
    var generatedBytes = System.GC.GetAllocatedBytesForCurrentThread() - before;
    before = System.GC.GetAllocatedBytesForCurrentThread();
    var native = Handwritten();
    var nativeBytes = System.GC.GetAllocatedBytesForCurrentThread() - before;
    if (!generated || !native || generatedBytes != nativeBytes)
      throw new System.Exception($"native allocation {generatedBytes}/{nativeBytes}");
    System.Console.WriteLine($"native allocation {generatedBytes}/{nativeBytes}");
  `);
  assert.match(output, /native allocation (\d+)\/\1/);
});

for (const [name, sourceText] of Array.from(openSources).slice(0, 28)) {
test(`open empty freeze proof rejects ${name} before any publication`, () => {
    const compiled = compileCsharpSource({ surface: "js", sourceText });
    assert.equal(compiled.sourceDiagnosticsText, "", "source remains valid without annotations");
    assert.equal(compiled.extensionDiagnostics.length + compiled.targetDiagnostics.length > 0, true,
      "missing exact native origin evidence must fail closed");
    assert.equal(compiled.targetDiagnostics.some(diagnostic => diagnostic.code === "CSHARP_JS_SOURCE_PROFILE_CALL_NOT_CLOSED" &&
      /^The exact selected JS source-profile call 'js\.ObjectConstructor\.(?:freeze|isFrozen)\.member' has no closed C# target relation\.$/.test(diagnostic.message)), true,
      "the exact freeze operation owner rejects the unproven domain");
    assert.equal(compiled.artifacts.size, 0, "rejected source publishes no target artifacts");
  });
}

test("unrefined absence cannot bypass the source object's non-absent contract", () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText:
    `export function run(value: object | null): object | null { return Object.freeze(value); }` });
  assert.match(compiled.sourceDiagnosticsText, /TS2345/);
  assert.match(compiled.sourceDiagnosticsText, /null.*not assignable/);
  assert.equal(compiled.artifacts.size, 0, "invalid absence publishes no target artifacts");
});
