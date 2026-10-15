import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { callableInterfaceFiles, asyncCallableInterfaceFiles, nativeAsyncCallableFiles, inlineNativeAsyncCallableFiles, nonErasedCallableInterfaces } from "../../../../tsonic/test/fixtures/callable-interfaces.mjs";

for (const surface of [undefined, "js"]) {
  test(`callable interfaces retain exact native signatures on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: callableInterfaceFiles["index.ts"],
      files: { "callbacks.ts": callableInterfaceFiles["callbacks.ts"] } });
    executeCsharpConstruction(compiled, "callable-interfaces");
    const output = [...compiled.artifacts.values()].join("\n");
    assert.doesNotMatch(output, /interface (?:Callback|Numeric|Merged)/u);
  });
  test(`callable interfaces retain async results and one absence on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ surface, sourceText: asyncCallableInterfaceFiles["index.ts"],
      files: { "callbacks.ts": asyncCallableInterfaceFiles["callbacks.ts"] } }), "async-callable-interfaces", true);
  });
  test(`closed native async callables retain invocation timing and owner identity on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ surface, sourceText: nativeAsyncCallableFiles["index.ts"],
      files: { "callbacks.ts": nativeAsyncCallableFiles["callbacks.ts"] } }), "native-async-callable-ownership", true);
  });
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
