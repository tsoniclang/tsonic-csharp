import test from "node:test";
import { nativeOptionDefaultsSource } from "../../../../tsonic/test/fixtures/native-option-defaults.mjs";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

test("native defaults retain literals, signed zero and lazy suspended destructuring", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: nativeOptionDefaultsSource });
  assertCsharpCompilationSucceeded(compiled);
  executeCsharpConstruction(compiled, "native-option-defaults", true, false, [],
    "await Tsonic.Generated.Index.main();");
});
