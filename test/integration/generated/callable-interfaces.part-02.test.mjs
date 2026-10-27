import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { callableInterfaceFiles, asyncCallableInterfaceFiles, nativeAsyncCallableFiles, inlineNativeAsyncCallableFiles, nonErasedCallableInterfaces } from "../../../../tsonic/test/fixtures/callable-interfaces.mjs";

for (const surface of Array.from([undefined, "js"]).slice(1, 2)) {
test(`pure closed async callables retain inline native storage on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ surface, sourceText: inlineNativeAsyncCallableFiles["index.ts"] }),
      "inline-native-async-callables", true);
  });
}

test("callable interface representation cannot erase extra contracts", () => {
  for (const declaration of nonErasedCallableInterfaces) {
    const compiled = compileCsharpSource({ sourceText: `${declaration}
export function apply(callback: Callback): number { return callback(2); }` });
    assert.ok(compiled.targetDiagnostics.length > 0);
    assert.equal(compiled.result.artifacts.length, 0);
  }
});
