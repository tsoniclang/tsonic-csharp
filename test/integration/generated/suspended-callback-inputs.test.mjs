import test from "node:test";
import { suspendedCallbackInputsSource } from "../../../../tsonic/test/fixtures/suspended-callback-inputs.mjs";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

test("suspended function and method callback inputs preserve repeated native invocation", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: suspendedCallbackInputsSource }),
    "suspended-callback-inputs", true, false, [], "await Tsonic.Generated.Index.main();");
});
