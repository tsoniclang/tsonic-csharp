import assert from "node:assert/strict";
import test from "node:test";
import { nativeAsyncResultOwnershipFiles } from "../../../../tsonic/test/fixtures/native-async-result-ownership.mjs";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of [undefined, "js"]) {
  test(`native async result carriers survive imported re-exports on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: nativeAsyncResultOwnershipFiles["index.ts"],
      files: Object.fromEntries(Object.entries(nativeAsyncResultOwnershipFiles).filter(([path]) => path !== "index.ts")) });
    const output = [...compiled.artifacts.values()].join("\n");
    assert.match(output, /Task<long>/u);
    assert.match(output, /Task<ulong>/u);
    assert.doesNotMatch(output, /Task<double>|Task<[^>]*BigInteger/u);
    executeCsharpConstruction(compiled, "native-async-result-ownership", true);
  });
}
