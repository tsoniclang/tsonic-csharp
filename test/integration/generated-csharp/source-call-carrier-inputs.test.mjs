import assert from "node:assert/strict";
import test from "node:test";
import { sourceCallCarrierInputs } from "../../../../tsonic/test/fixtures/source-call-carrier-inputs.mjs";
import { createTsonicPlugin } from "../../../../csharp-nodejs/dist/index.js";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

test("source-call inputs retain exact native-width integer carriers", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", capabilities: [createTsonicPlugin()], sourceText: sourceCallCarrierInputs });
  assertCsharpCompilationSucceeded(compiled);
  const output = [...compiled.artifacts].filter(([path]) => path.endsWith(".cs")).map(([, text]) => text).join("\n");
  assert.equal(/9007199254740992|Convert\.ToDouble/u.test(output), false);
  executeCsharpConstruction(compiled, "source-call-carrier-inputs");
});
