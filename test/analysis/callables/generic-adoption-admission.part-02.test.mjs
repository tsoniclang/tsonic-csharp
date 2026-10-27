import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { code, identity, nativeEntryCases, nativeEntryInverses, nativeOpaquePayloadCases, nativeConstructorCases, nativeConstructorInverses, sourcePosition, sourceSpan, cases, rejected } from "./generic-adoption-admission.fixtures.mjs";

for (const [name, sourceText] of Array.from(nativeEntryInverses).slice(5, 13)) {
test("C# native callback non-adoption inverse: " + name, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface: "js", targetOptions: { outputType: "Exe" }, sourceText });
    assert.equal(compiled.result.diagnostics.length, 0,
      JSON.stringify(compiled.result.diagnostics.map(({ code, message }) => ({ code, message }))));
    const output = executeCsharpConstruction(compiled, "native-callback-inverse-" + name, false, false, [], "");
    assert.equal(output.trim(), "7", "only the actual resolver's same-activation payload is adopted");
  });
}
