import test from "node:test";
import { indexedCallableSource } from "../../../../tsonic/test/fixtures/indexed-callables.mjs";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

test("indexed callables retain exact presence, evaluation order and shared mutation", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: indexedCallableSource });
  executeCsharpConstruction(compiled, "indexed-callables");
});
