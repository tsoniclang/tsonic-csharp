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

test("cross-file declared object signatures retain readonly freeze identity", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: frozenEmptyStorageCrossFileSources["index.ts"],
    files: { "retain.ts": frozenEmptyStorageCrossFileSources["retain.ts"] } });
  assertCsharpCompilationSucceeded(compiled);
  assert.doesNotMatch(generatedText(compiled), /FrozenObject|ConditionalWeakTable|dynamic\b|Unsafe\./);
  executeCsharpConstruction(compiled, "frozen-empty-cross-file");
});

test("repeated empty freeze matches handwritten native allocation with no additional state", { timeout: 300_000 }, context => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    export function run(): boolean {
      const value: object = {};
      let retained = value;
      for (let iteration = 0; iteration < 20000; iteration += 1) {
        retained = Object.freeze(value);
      }
      return retained === value;
    }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  assert.doesNotMatch(generatedText(compiled), /EmptyObject\.(?:Freeze|IsFrozen)|FrozenObject|CheckWrite|ConditionalWeakTable|TsValue|dynamic\b/);
  const output = executeCsharpConstruction(compiled, "frozen-empty-native-allocation", false, false, [], `
    static bool Handwritten() {
      var value = new Tsonic.CSharp.Runtime.EmptyObject();
      object retained = value;
      for (var iteration = 0; iteration < 20000; iteration += 1) {
        retained = value;
      }
      return System.Object.ReferenceEquals(retained, value);
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
  context.diagnostic(output.trim());
});

const identitySources = new Set([
  "private erased record", "exported opaque object", "exported opaque object with local empty call",
  "exported alias", "mixed allocation origins", "exported generic unknown with local empty call", "escaping private callable",
]);

for (const [name, sourceText] of Array.from(openSources).slice(0, 28)) {
test(`declared readonly freeze contract: ${name}`, () => {
    const compiled = compileCsharpSource({ surface: "js", sourceText });
    assert.equal(compiled.sourceDiagnosticsText, "", "source remains valid without annotations");
    if (identitySources.has(name)) {
      assertCsharpCompilationSucceeded(compiled);
      assert.doesNotMatch(generatedText(compiled), /EmptyObject\.(?:Freeze|IsFrozen)|FrozenObject|CheckWrite|ConditionalWeakTable/);
    } else {
      assert.equal(compiled.targetDiagnostics.some(diagnostic => diagnostic.code === "TSONIC_IS_FROZEN_UNSUPPORTED" &&
        diagnostic.message.includes("Object.isFrozen has no native equivalent")), true,
        "the selected query is refused independently of the operand's origin");
      assert.equal(compiled.artifacts.size, 0, "refused runtime frozenness publishes no target artifacts");
    }
  });
}

test("unrefined absence cannot bypass the source object's non-absent contract", () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText:
    `export function run(value: object | null): object | null { return Object.freeze(value); }` });
  assert.match(compiled.sourceDiagnosticsText, /TS2345/);
  assert.match(compiled.sourceDiagnosticsText, /null.*not assignable/);
  assert.equal(compiled.artifacts.size, 0, "invalid absence publishes no target artifacts");
});
