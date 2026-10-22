import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { eagerCallableCreationSource, eagerCallableCreationNativeProof } from "../../fixtures/eager-callable-creation.mjs";

test("every confirmed eager JS callback family has handwritten-native allocation, ABI and identity", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: eagerCallableCreationSource });
  assertCsharpCompilationSucceeded(compiled);
  const source = compiled.artifacts.get("src/Index.cs");
  assert.equal(typeof source, "string");
  assert.equal(/static T __tsonic_callable_[^\n]*\(T value, int [^,]+, Tsonic\.CSharp\.Js\.JSArray<T> /u.test(source), true, "exact inherited generic trailing ABI");
  assert.equal(/new Func<int, int>\(__tsonic_callable_/u.test(source), true, "fresh unknown/observed destination identities");
  assert.equal(/Dictionary|Reflection|dynamic\b|Unsafe\./u.test(source), false, "no manual caches or unchecked adapters");
  executeCsharpConstruction(compiled, "eager-callable-creation", false, false, [], eagerCallableCreationNativeProof);
});
