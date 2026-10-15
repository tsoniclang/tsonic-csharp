import test from "node:test";
import { implicitCallableInterfaceSource } from "../../../../tsonic/test/fixtures/implicit-callable-interfaces.mjs";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of ["native", "js"]) {
  test(`implicit callable interfaces separate generic signature inference from physical storage in ${surface}`,
    { timeout: 300_000 }, () => {
      const compiled = compileCsharpSource({ surface, sourceText: implicitCallableInterfaceSource });
      executeCsharpConstruction(compiled, `implicit-callable-interface-${surface}`, false);
    });
}
