import test from "node:test";
import { genericAncestorProjectionSource } from "../../../../tsonic/test/fixtures/generic-ancestor-projection.mjs";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

test("checked generic nominal recovery includes the exact ancestor view of a more-derived root", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: genericAncestorProjectionSource });
  assertCsharpCompilationSucceeded(compiled);
  executeCsharpConstruction(compiled, "generic-ancestor-projection");
});
