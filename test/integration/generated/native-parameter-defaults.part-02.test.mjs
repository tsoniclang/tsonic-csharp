import assert from "node:assert/strict";
import test from "node:test";
import { checkCsharpSource, compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { nativeAbsentParameterDefaultsSource, nativeParameterDefaultsSource, orderedParameterDefaultsSource } from "../../../../tsonic/test/fixtures/native-parameter-defaults.mjs";

for (const surface of Array.from(["native", "js"]).slice(0, 2)) {
test(`generic defaults retain checked value binders, absence and callee-side effects (${surface})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      import type { int32 } from "@tsonic/core/types.js";
      let calls: int32 = 0;
      function callCount(): int32 { return calls; }
      function next(): int32 { calls += 1; return 7; }
      function choose<Value>(fallback: Value, actual: Value = fallback): Value { return actual; }
      function deferred<Value>(fallback: () => Value, actual: Value = fallback()): Value { return actual; }
      export function run(): boolean {
        calls = 0;
        return choose<int32>(5) === 5 && choose<int32>(5, 9) === 9 &&
          choose<int32>(5, undefined) === 5 && choose<string>("first", undefined) === "first" &&
          choose<string>("first", "second") === "second" &&
          deferred<int32>(next, 11) === 11 && callCount() === 0 &&
          deferred<int32>(next) === 7 && callCount() === 1 &&
          deferred<int32>(next, undefined) === 7 && callCount() === 2;
      }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    const source = [...compiled.artifacts.values()].join("\n");
    assert.match(source, /\bOptionalStorage_\w+\s+\w+\s*=\s*default\(OptionalStorage_\w+\)/u,
      "the actual generic storage parameter uses a legal native default");
    assert.match(source, /\bOptionalStorage_\w+\s+\w+\s*=\s*default\(OptionalStorage_\w+\)!/u,
      "the proved omission default explicitly admits absence for either reference or value native generic storage");
    assert.doesNotMatch(source, /\bOptionalStorage_\w+\s+\w+\s*=\s*null\b/u,
      "the open native generic carrier is never incorrectly declared nullable");
    executeCsharpConstruction(compiled, `generic-native-parameter-defaults-${surface}`);
  });
}
