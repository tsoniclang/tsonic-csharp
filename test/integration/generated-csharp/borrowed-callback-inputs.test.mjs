import test from "node:test";
import { borrowedCallbackInputSource } from "../../../../tsonic/test/fixtures/borrowed-callback-inputs.mjs";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of [undefined, "js"]) {
  test(`selected callback inputs preserve native repeated mutation and readonly aliases (${surface ?? "native"})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: borrowedCallbackInputSource });
    executeCsharpConstruction(compiled, `borrowed-callback-inputs-${surface ?? "native"}`);
  });
}
