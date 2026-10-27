import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { moduleInitializationErrorCases } from "../../../../tsonic/test/fixtures/module-initialization-errors.mjs";

for (const surface of Array.from([undefined, "js"]).slice(0, 1)) {
for (const current of Array.from(moduleInitializationErrorCases).slice(0, 8)) {
test(`module initialization preserves ${current.name} on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
      const compiled = compileCsharpSource({ surface, targetOptions: { outputType: "Exe" },
        sourceText: current.source, files: current.files,
        ...(current.sourcePackages === undefined ? {} : { sourcePackages: current.sourcePackages }),
      });
      assertCsharpCompilationSucceeded(compiled);
      assert.equal(executeCsharpConstruction(compiled, `module-errors-${current.name}-${surface ?? "native"}`), "");
    });
}
}

for (const surface of Array.from([undefined, "js"]).slice(1, 2)) {
for (const current of Array.from(moduleInitializationErrorCases).slice(0, 1)) {
test(`module initialization preserves ${current.name} on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
      const compiled = compileCsharpSource({ surface, targetOptions: { outputType: "Exe" },
        sourceText: current.source, files: current.files,
        ...(current.sourcePackages === undefined ? {} : { sourcePackages: current.sourcePackages }),
      });
      assertCsharpCompilationSucceeded(compiled);
      assert.equal(executeCsharpConstruction(compiled, `module-errors-${current.name}-${surface ?? "native"}`), "");
    });
}
}
