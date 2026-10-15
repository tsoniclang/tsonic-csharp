import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { frozenEmptyStorageSources, frozenEmptyStorageOpenSources, frozenEmptyStorageCrossFileSources } from "../../../../tsonic/test/fixtures/frozen-empty-storage.mjs";

function generatedText(compiled) {
  return [...compiled.artifacts.values()].join("\n");
}

test("inferred broad freeze results retain the native object carrier instead of an empty shape", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: frozenEmptyStorageSources[0][1] });
  assertCsharpCompilationSucceeded(compiled);
  const text = generatedText(compiled);
  assert.match(text, /object frozen =/);
  assert.match(text, /EmptyObject\.Freeze<object>/);
  assert.match(text, /EmptyObject\.Freeze<Tsonic\.CSharp\.Runtime\.EmptyObject>/);
  assert.doesNotMatch(text, /FrozenObject|ConditionalWeakTable|dynamic\b|Unsafe\./);
  executeCsharpConstruction(compiled, "frozen-empty-inferred-object-carrier");
});

test("empty freeze uses one native state across broad aliases, parameters and returns", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: frozenEmptyStorageSources[1][1] });
  assertCsharpCompilationSucceeded(compiled);
  const text = generatedText(compiled);
  assert.match(text, /EmptyObject\.Freeze<object>/);
  assert.match(text, /EmptyObject\.IsFrozen<object>/);
  assert.match(text, /object retain\(object value\)/);
  assert.match(text, /9007199254740993L/);
  assert.doesNotMatch(text, /FrozenObject|ConditionalWeakTable|dynamic\b|Unsafe\.|GetProperty|Activator/);
  executeCsharpConstruction(compiled, "frozen-empty-broad-aliases");
});

test("empty freeze retains exact container origins without altering native object elements", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: frozenEmptyStorageSources[2][1] });
  assertCsharpCompilationSucceeded(compiled);
  assert.doesNotMatch(generatedText(compiled), /FrozenObject|ConditionalWeakTable/);
  executeCsharpConstruction(compiled, "frozen-empty-container-aliases");
});

test("empty freeze closes private callbacks and receivers without treating type exports as value escapes", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: frozenEmptyStorageSources[3][1] });
  assertCsharpCompilationSucceeded(compiled);
  assert.doesNotMatch(generatedText(compiled), /FrozenObject|ConditionalWeakTable|dynamic\b|Unsafe\./);
  executeCsharpConstruction(compiled, "frozen-empty-closed-local-receivers");
});

test("exported readonly token bindings retain exact empty identity without an external replacement domain", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: frozenEmptyStorageSources[4][1] });
  assertCsharpCompilationSucceeded(compiled);
  const text = generatedText(compiled);
  assert.match(text, /public static object token\s*\{\s*get;\s*private set;\s*\}/);
  assert.doesNotMatch(text, /FrozenObject|ConditionalWeakTable/);
  executeCsharpConstruction(compiled, "frozen-empty-exported-readonly-token");
});

test("selected aliases of native freeze operations preserve exact result identity", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: frozenEmptyStorageSources[5][1] });
  assertCsharpCompilationSucceeded(compiled);
  assert.doesNotMatch(generatedText(compiled), /FrozenObject|ConditionalWeakTable/);
  executeCsharpConstruction(compiled, "frozen-empty-selected-operation-aliases");
});

test("externally visible readonly empty members retain their one fixed native value domain", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: frozenEmptyStorageSources[6][1] });
  assertCsharpCompilationSucceeded(compiled);
  assert.doesNotMatch(generatedText(compiled), /FrozenObject|ConditionalWeakTable/);
  executeCsharpConstruction(compiled, "frozen-empty-exported-readonly-members");
});

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

const openSources = frozenEmptyStorageOpenSources;

for (const [name, sourceText] of openSources) {
  test(`open empty freeze proof rejects ${name} before any publication`, () => {
    const compiled = compileCsharpSource({ surface: "js", sourceText });
    assert.equal(compiled.sourceDiagnosticsText, "", "source remains valid without annotations");
    assert.equal(compiled.extensionDiagnostics.length + compiled.targetDiagnostics.length > 0, true,
      "missing exact native origin evidence must fail closed");
    assert.equal(compiled.targetDiagnostics.some(diagnostic => diagnostic.code === "TS9101001" &&
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
