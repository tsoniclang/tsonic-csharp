import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { optionalPrimitiveConversionsSource } from "../../../../tsonic/test/fixtures/optional-primitive-conversions.mjs";

test("optional primitive conversion retains native values, absence and API-local behavior", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: optionalPrimitiveConversionsSource });
  executeCsharpConstruction(compiled, "optional-primitive-conversions");
  assert.doesNotMatch([...compiled.artifacts.values()].join("\n"), /BigInteger|\(double\)\s*(?:exact|maximum)/u);
});
