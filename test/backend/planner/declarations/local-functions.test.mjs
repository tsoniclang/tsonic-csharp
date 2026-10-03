import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../../helpers/direct-csharp-session.mjs";
import { finiteCompletionSequencingSource } from "../../../helpers/finite-completion-sequencing.mjs";

function generated(sourceText, surface) {
  const compiled = compileCsharpSource({ sourceText, surface });
  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.equal(compiled.extensionDiagnostics.length, 0, "source extensions accept the unchanged function declarations");
  assert.equal(compiled.targetDiagnostics.length, 0, compiled.targetDiagnostics.map(diagnostic => diagnostic.message).join("\n"));
  return [...compiled.artifacts.values()].join("\n");
}

for (const surface of ["native", "js"]) {
  test(`lexical function declarations retain hoisting, recursion and stack captures in ${surface}`, () => {
    const source = generated(`
      import type { int32 } from "@tsonic/core/types.js";
      export function run(): int32 {
        let current = 0 as int32;
        const before = even(4 as int32);
        function even(value: int32): int32 { if (value === 0) return 1 as int32; return odd((value - 1) as int32); }
        function odd(value: int32): int32 { if (value === 0) return 0 as int32; return even((value - 1) as int32); }
        function increment(): int32 { current += 1; return current; }
        return (before + increment() + increment()) as int32;
      }`, surface);
    assert.match(source, /int even\(int value\)/u);
    assert.match(source, /int odd\(int value\)/u);
    assert.match(source, /int increment\(\)/u);
    assert.doesNotMatch(source, /new (?:System\.)?Func|new .*Capture|=>/u);
  });

  test(`lexical generic and escaping functions keep their exact native signatures in ${surface}`, () => {
    const source = generated(`
      import type { int32 } from "@tsonic/core/types.js";
      export function generic(): int32 {
        function identity<T>(value: T): T { return value; }
        return identity(3 as int32);
      }
      export function counter(): () => int32 {
        let current = 0 as int32;
        function next(): int32 { current += 1; return current; }
        return next;
      }`, surface);
    assert.match(source, /T identity<T>\(T value\)/u);
    assert.match(source, /int next\(\)/u);
    assert.doesNotMatch(source, /DynamicInvoke|Task\.Run|\.GetMethod\(/u);
  });

  test(`finite sequencing retains authored lexical declarations in ${surface}`, () => {
    const source = generated(finiteCompletionSequencingSource, surface);
    assert.match(source, /mutate\(/u);
    assert.match(source, /first\(/u);
    assert.match(source, /await/u);
    assert.doesNotMatch(source, /ContinueWith|Task\.Run|Task\.FromResult/u);
  });
}
