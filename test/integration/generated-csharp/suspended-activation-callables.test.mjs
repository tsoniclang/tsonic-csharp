import test from "node:test";
import { suspendedActivationCallableSource } from "../../../../tsonic/test/fixtures/suspended-activation-callables.mjs";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

test("suspended frame entries retain one exact activation across awaits and later calls",
  { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface: "js", sourceText: suspendedActivationCallableSource });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, "suspended-activation-callables", true);
  });
