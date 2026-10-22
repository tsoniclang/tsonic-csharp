import test from "node:test";
import assert from "node:assert/strict";
import { retainedPointerInputSource, reorderedPointerInputSource, widePointerInputSource,
  incompatiblePointerInputSources } from "../../../../tsonic/test/fixtures/retained-pointer-inputs.mjs";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of ["native", "js"]) {
  test(`retained callbacks preserve native integer storage, aliases and forwarding in ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: retainedPointerInputSource });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `retained-pointer-inputs-${surface}`);
  });
}

for (const [name, sourceText] of [["reordered", reorderedPointerInputSource], ["int64", widePointerInputSource]]) {
  test(`contextual callback inference preserves ${name} native metadata`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface: "native", sourceText });
    assertCsharpCompilationSucceeded(compiled);
    if (name === "int64") {
      const code = [...compiled.artifacts.values()].join("\n");
      assert.match(code, /Location<long>/u);
      assert.doesNotMatch(code, /9007199254740992/u);
    }
    executeCsharpConstruction(compiled, `retained-input-${name}`);
  });
}

for (const [index, sourceText] of incompatiblePointerInputSources.entries()) {
  test(`independent conflicting callback carrier ${index} cannot reinterpret native pointer storage`, () => {
    const compiled = compileCsharpSource({ surface: "native", sourceText });
    assert.equal(compiled.result.diagnostics.length > 0 || compiled.extensionDiagnostics.length > 0 ||
      compiled.sourceDiagnosticsText.length > 0, true, "an incompatible native carrier remains rejected");
    assert.equal(compiled.artifacts.size, 0, "no invalid native output is published");
  });
}
