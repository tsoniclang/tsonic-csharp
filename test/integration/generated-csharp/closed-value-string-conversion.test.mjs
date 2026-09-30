import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { closedValueStringConversionSource } from "../../../../tsonic/test/fixtures/closed-value-string-conversion.mjs";

test("explicit String conversion observes exact closed native payloads", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: closedValueStringConversionSource });
  executeCsharpConstruction(compiled, "closed-value-string-conversion");
});
