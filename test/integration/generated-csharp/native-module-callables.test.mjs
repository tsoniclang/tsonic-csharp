import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { conflictingNativeCallableSource, nativeModuleCallableFiles, relocatedModuleCallableFiles } from "../../../../tsonic/test/fixtures/native-module-callables.mjs";

for (const surface of [undefined, "js"]) {
  test(`relocated callable bodies retain exact module owners on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: relocatedModuleCallableFiles["index.ts"],
      files: Object.fromEntries(Object.entries(relocatedModuleCallableFiles).filter(([path]) => path !== "index.ts")) });
    assertCsharpCompilationSucceeded(compiled);
    const shapes = compiled.artifacts.get("generated/TsonicObjectShapes.cs");
    assert.equal(typeof shapes, "string");
    assert.match(shapes, /Helpers\.multiply\(Helpers\.step\(/u);
    assert.match([...compiled.artifacts.values()].join("\n"), /Other\.step\(/u);
    executeCsharpConstruction(compiled, "relocated-module-callables");
  });
  test(`typed native module callables retain checked body ABIs on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: nativeModuleCallableFiles["index.ts"],
      files: Object.fromEntries(Object.entries(nativeModuleCallableFiles).filter(([path]) => path !== "index.ts")) });
    executeCsharpConstruction(compiled, "typed-native-module-callables", true);
    const output = [...compiled.artifacts.values()].join("\n");
    assert.match(output, /(?:Func<long, (?:System\.Threading\.Tasks\.)?Task<long>>|exact\(long value\))/u);
    assert.doesNotMatch(output, /(?:double|BigInteger)\s+wide\b/u);
  });
  test(`inherited callable contracts reject conflicting native widths on ${surface ?? "native"}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: conflictingNativeCallableSource });
    assert.equal(compiled.sourceDiagnosticsText, "");
    assert.ok(compiled.targetDiagnostics.length > 0);
    assert.equal(compiled.result.artifacts.length, 0);
  });
}
