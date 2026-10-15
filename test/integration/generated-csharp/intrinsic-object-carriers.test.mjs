import assert from "node:assert/strict";
import test from "node:test";
import { intrinsicObjectCarrierFiles } from "../../../../tsonic/test/fixtures/intrinsic-object-carriers.mjs";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of [undefined, "js"]) {
  test(`authored and inferred intrinsic objects retain the same native payload carrier in ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, files: intrinsicObjectCarrierFiles,
      sourceText: intrinsicObjectCarrierFiles["index.ts"] });
    assertCsharpCompilationSucceeded(compiled);
    const source = compiled.artifacts.get("src/Objects.cs");
    assert.equal(source !== undefined, true);
    for (const name of ["retain", "inferred", "readonly"]) {
      const identifier = name === "readonly" ? "@readonly" : name;
      assert.match(source, new RegExp(`object ${identifier}\\(object value\\)`, "u"));
    }
    assert.doesNotMatch(source, /EmptyObject|TsValue/u);
    executeCsharpConstruction(compiled, `intrinsic-object-carriers-${surface ?? "native"}`);
  });
}
