import test from "node:test";
import { callableInputBorrowSource } from "../../../../tsonic/test/fixtures/callable-input-borrows.mjs";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

test("invocation-only callback inputs consume exact inferred borrowed producer signatures",
  { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface: "js", sourceText: callableInputBorrowSource });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, "callable-input-borrows");
  });
