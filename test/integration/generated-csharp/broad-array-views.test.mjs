import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { broadArrayViewSource } from "../../../../tsonic/test/fixtures/broad-array-views.mjs";

test("checked broad array views retain their native backing and element identity", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: broadArrayViewSource }), "broad-array-views");
});
