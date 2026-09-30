import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { emptyArrayStorageFiles, emptyNativeArrayStorageFiles } from "../../../../tsonic/test/fixtures/empty-array-storage.mjs";

for (const surface of ["native", "js"]) test(`empty array storage retains its uninhabited element on ${surface}`, { timeout: 300_000 }, () => {
  const files = surface === "js" ? emptyArrayStorageFiles : emptyNativeArrayStorageFiles;
  const compiled = compileCsharpSource({ surface, sourceText: files["index.ts"] });
  executeCsharpConstruction(compiled, `empty-array-storage-${surface}`);
  const source = [...compiled.artifacts.values()].join("\n");
  assert.match(source, /Never/u);
  assert.doesNotMatch(source, /TsValue|ToArray\(|\.Clone\(/u);
});
