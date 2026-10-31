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
  assert.match(source, /Func<T, int, Tsonic\.CSharp\.Js\.JSArray<T>, T> mapper = \(T value, int \w+, Tsonic\.CSharp\.Js\.JSArray<T> \w+\) => value;/u,
    "the original generic value has its exact native consumer slots");
  assert.doesNotMatch(source, /__tsonic_callable_|new Func|new Action/u, "native callbacks need no outlined helper or explicit method delegate construction");
  assert.equal(/Dictionary|Reflection|dynamic\b|Unsafe\./u.test(source), false, "no manual caches or unchecked adapters");
  executeCsharpConstruction(compiled, "eager-callable-creation", false, false, [], eagerCallableCreationNativeProof);
});
