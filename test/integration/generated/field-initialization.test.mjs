import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { fieldInitializationSource } from "../../../../tsonic/test/fixtures/field-initialization.mjs";

for (const surface of ["native", "js"]) {
  test(`explicit native fields have no runtime marker initializer on ${surface}`, { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ surface, sourceText: fieldInitializationSource }), `field-initialization-${surface}`);
  });
}
