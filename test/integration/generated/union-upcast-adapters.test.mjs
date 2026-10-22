import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { closedInstanceAdapterFiles, genericInstanceAdapterFiles } from "../../../../tsonic/test/fixtures/closed-instance-tests.mjs";

for (const surface of [undefined, "js"]) {
  test(`native override results compose upcasts and union injection on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ surface, sourceText: closedInstanceAdapterFiles["index.ts"],
      files: { "models.ts": closedInstanceAdapterFiles["models.ts"] } }), "union-upcast-adapters");
  });
}

for (const surface of [undefined, "js"]) {
  test(`generic override results retain optional storage on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ surface, sourceText: genericInstanceAdapterFiles["index.ts"],
      files: { "models.ts": genericInstanceAdapterFiles["models.ts"] } }), "generic-upcast-adapters");
  });
}
