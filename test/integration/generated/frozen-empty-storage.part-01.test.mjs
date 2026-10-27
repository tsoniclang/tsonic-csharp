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
