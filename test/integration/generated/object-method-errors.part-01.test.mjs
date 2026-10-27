import assert from "node:assert/strict";
import test from "node:test";
import { nativeErrorTransportCases } from "../../../../tsonic/test/fixtures/native-error-transport.mjs";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of Array.from([undefined, "js"]).slice(0, 1)) {
for (const [name, sourceText] of Array.from(nativeErrorTransportCases).slice(0, 5)) {
test(`object-method Error owner ${name} (${surface ?? "native"})`, { timeout: 300_000 }, () => {
      const compiled = compileCsharpSource({ surface, sourceText, targetOptions: { outputType: "Exe" } });
      assertCsharpCompilationSucceeded(compiled);
      assert.equal(compiled.artifacts.has("generated/TsonicEntrypoint.cs"), true, "native executable startup is present");
      executeCsharpConstruction(compiled, `${name}-${surface ?? "native"}`);
    });
}
}

for (const surface of Array.from([undefined, "js"]).slice(1, 2)) {
for (const [name, sourceText] of Array.from(nativeErrorTransportCases).slice(0, 4)) {
test(`object-method Error owner ${name} (${surface ?? "native"})`, { timeout: 300_000 }, () => {
      const compiled = compileCsharpSource({ surface, sourceText, targetOptions: { outputType: "Exe" } });
      assertCsharpCompilationSucceeded(compiled);
      assert.equal(compiled.artifacts.has("generated/TsonicEntrypoint.cs"), true, "native executable startup is present");
      executeCsharpConstruction(compiled, `${name}-${surface ?? "native"}`);
    });
}
}
