import test from "node:test";
import { closedErrorInputsSource } from "../../../../tsonic/test/fixtures/closed-error-inputs.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";

test("checked closed Error inputs retain native identity on the JS surface", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: closedErrorInputsSource }), "closed-error-inputs");
});
