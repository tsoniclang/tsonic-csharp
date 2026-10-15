import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { conflictingNativeInterfaceFiles, typeSignatureOwnershipFiles } from "../../../../tsonic/test/fixtures/type-signature-ownership.mjs";

for (const surface of [undefined, "js"]) {
  test(`cross-file constructor and structural method signatures retain their owners on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: typeSignatureOwnershipFiles["index.ts"],
      files: Object.fromEntries(Object.entries(typeSignatureOwnershipFiles).filter(([path]) => path !== "index.ts")) });
    executeCsharpConstruction(compiled, "type-signature-ownership");
  });
  test(`generic method-only interface contracts retain conflicting native widths on ${surface ?? "native"}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: conflictingNativeInterfaceFiles["index.ts"],
      files: Object.fromEntries(Object.entries(conflictingNativeInterfaceFiles).filter(([path]) => path !== "index.ts")) });
    assert.equal(compiled.sourceDiagnosticsText, "");
    assert.ok(compiled.targetDiagnostics.length > 0);
    assert.equal(compiled.result.artifacts.length, 0);
  });
}
