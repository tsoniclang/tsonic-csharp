import assert from "node:assert/strict";
import test from "node:test";
import { receiverFieldStorageCases, receiverFieldStorageFreezeSource } from "../../../../tsonic/test/fixtures/receiver-field-storage-cases.mjs";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of ["native", "js"]) for (const example of receiverFieldStorageCases) {
  test(`live stored fields preserve direct structural views and reentrancy: ${example.name} in ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: example.source +
      '\nexport function main(): void { if (!run()) throw new Error("retained structural field"); }' });
    assertCsharpCompilationSucceeded(compiled);
    assert.equal(/dynamic|Unsafe\.|GetProperty|Activator/u.test([...compiled.artifacts.values()].join("\n")), false);
    executeCsharpConstruction(compiled, `receiver-field-storage-${example.name}-${surface}`);
  });
}

test("freezing an identity-preserving direct view rejects live field replacement", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: receiverFieldStorageFreezeSource +
    '\nexport function main(): void { if (!run()) throw new Error("retained structural freeze"); }' });
  assertCsharpCompilationSucceeded(compiled);
  executeCsharpConstruction(compiled, "receiver-field-storage-freeze");
});
