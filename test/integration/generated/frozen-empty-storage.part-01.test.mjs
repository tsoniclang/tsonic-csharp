import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { frozenEmptyStorageSources, frozenEmptyStorageOpenSources, frozenEmptyStorageCrossFileSources } from "../../../../tsonic/test/fixtures/frozen-empty-storage.mjs";
import { generatedText, openSources } from "./frozen-empty-storage.fixtures.mjs";

test("inferred broad freeze results retain the native object carrier instead of an empty shape", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: frozenEmptyStorageSources[0][1] });
  assertCsharpCompilationSucceeded(compiled);
  const text = generatedText(compiled);
  assert.match(text, /object frozen =/);
  assert.doesNotMatch(text, /EmptyObject\.(?:Freeze|IsFrozen)|FrozenObject|CheckWrite|ConditionalWeakTable|dynamic\b|Unsafe\./);
  executeCsharpConstruction(compiled, "frozen-empty-inferred-object-carrier");
});

for (const [index, name, allocations] of [[0, "inferred broad aliases", 2], [1, "private parameters and returns", 3]]) {
  test(`closed empty source storage retains native freeze identity and strict cost for ${name}`, { timeout: 300_000 }, () => {
    const sourceText = frozenEmptyStorageSources[index][1];
    const compiled = compileCsharpSource({ surface: "js", sourceText });
    assertCsharpCompilationSucceeded(compiled);
    const output = generatedText(compiled);
    assert.equal([...output.matchAll(/new (?:Tsonic\.CSharp\.Runtime\.)?EmptyObject\b/gu)].length, allocations,
      "each original empty producer constructs its source-type carrier once");
    assert.doesNotMatch(output, /TsObject|CreateDynamicObject|EmptyObject\.(?:Freeze|IsFrozen)|FrozenObject|CheckWrite|ConditionalWeakTable|DynamicInvoke|System\.Reflection|\.Clone\(|\.ToArray\(/u);
    executeCsharpConstruction(compiled, `closed-empty-freeze-cost-${index}`, false, false, [], `
using System;
using Tsonic.CSharp.Runtime;
using Index = Tsonic.Generated.Index;
for (int index = 0; index < 10000; index++) {
    if (!Index.run() || !Native.Run()) throw new Exception("original native freeze value and reference identity");
}
long before = GC.GetAllocatedBytesForCurrentThread();
for (int index = 0; index < 8192; index++) if (!Index.run()) throw new Exception("generated native identity");
long generated = GC.GetAllocatedBytesForCurrentThread() - before;
before = GC.GetAllocatedBytesForCurrentThread();
for (int index = 0; index < 8192; index++) if (!Native.Run()) throw new Exception("handwritten native identity");
long handwritten = GC.GetAllocatedBytesForCurrentThread() - before;
if (generated != handwritten) throw new Exception($"empty native allocation {generated} != {handwritten}");
sealed class NativeEmpty : ITsClosedValueCarrier { }
static class Native {
    static object Retain(object value) => value;
    static object Frozen(object value) => value;
    public static bool Run() {
        object first = new NativeEmpty();
        var alias = Retain(first);
        ${index === 0 ? `var frozen = first;
        var retained = Retain(frozen);
        var direct = new NativeEmpty();
        var directFrozen = direct;
        return ReferenceEquals(frozen, alias) && ReferenceEquals(retained, first) && ReferenceEquals(directFrozen, direct);`
      : `var direct = new NativeEmpty();
        object directAlias = direct;
        var frozenFirst = Frozen(first);
        var frozenDirect = direct;
        object second = new NativeEmpty();
        long wide = 9007199254740993L;
        return ReferenceEquals(frozenFirst, alias) && ReferenceEquals(frozenDirect, directAlias) &&
            ReferenceEquals(frozenDirect, direct) && !ReferenceEquals(second, first) && wide == 9007199254740993L;`}
    }
}
`);
  });
}

test("readonly freeze retains native identity across broad aliases, parameters and returns", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: frozenEmptyStorageSources[1][1] });
  assertCsharpCompilationSucceeded(compiled);
  const text = generatedText(compiled);
  assert.match(text, /object retain\(object value\)/);
  assert.match(text, /9007199254740993L/);
  assert.doesNotMatch(text, /EmptyObject\.(?:Freeze|IsFrozen)|FrozenObject|CheckWrite|ConditionalWeakTable|dynamic\b|Unsafe\.|GetProperty|Activator/);
  executeCsharpConstruction(compiled, "frozen-empty-broad-aliases");
});

test("readonly freeze preserves container identity without altering native object elements", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: frozenEmptyStorageSources[2][1] });
  assertCsharpCompilationSucceeded(compiled);
  assert.doesNotMatch(generatedText(compiled), /FrozenObject|ConditionalWeakTable/);
  executeCsharpConstruction(compiled, "frozen-empty-container-aliases");
});

test("readonly freeze preserves private callback and receiver identity", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: frozenEmptyStorageSources[3][1] });
  assertCsharpCompilationSucceeded(compiled);
  assert.doesNotMatch(generatedText(compiled), /FrozenObject|ConditionalWeakTable|dynamic\b|Unsafe\./);
  executeCsharpConstruction(compiled, "frozen-empty-closed-local-receivers");
});

test("exported readonly token bindings retain their native empty identity", { timeout: 300_000 }, () => {
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

test("externally visible readonly empty members retain their native identity", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: frozenEmptyStorageSources[6][1] });
  assertCsharpCompilationSucceeded(compiled);
  assert.doesNotMatch(generatedText(compiled), /FrozenObject|ConditionalWeakTable/);
  executeCsharpConstruction(compiled, "frozen-empty-exported-readonly-members");
});
