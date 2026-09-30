import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { independentStorageFamilyFiles } from "../../../../tsonic/test/fixtures/generic-storage-families.mjs";
import { structuralArrayStorageSource } from "../../../../tsonic/test/fixtures/structural-array-storage.mjs";

for (const surface of [undefined, "js"]) {
  test(`independent generic storage families retain distinct nested results (${surface ?? "native"})`, { timeout: 300_000 }, () => {
    const { "index.ts": sourceText, ...files } = independentStorageFamilyFiles;
    const compiled = compileCsharpSource({ surface, sourceText, files });
    executeCsharpConstruction(compiled, `independent-storage-families-${surface ?? "native"}`);
  });
  test(`inferred structural arrays preserve backing and element aliases (${surface ?? "native"})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: structuralArrayStorageSource });
    executeCsharpConstruction(compiled, `structural-array-storage-${surface ?? "native"}`);
  });
}
