import test from "node:test";
import assert from "node:assert/strict";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { optionalIndexedLocationSource } from "../../../../tsonic/test/fixtures/optional-indexed-locations.mjs";

for (const surface of [undefined, "js"]) {
  test(`optional indexed locations retain native absence, widths and identity (${surface ?? "native"})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: optionalIndexedLocationSource });
    if (surface === "js") {
      const source = compiled.artifacts.get("src/Index.cs");
      assert.match(source, /\.elementLocation\(/u);
      assert.doesNotMatch(source, /CreateIndexedElement/u);
    }
    executeCsharpConstruction(compiled, `optional-indexed-locations-${surface ?? "native"}`);
  });
}
