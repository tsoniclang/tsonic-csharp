import test from "node:test";
import { implicitErrorInterfaceSource } from "../../../../tsonic/test/fixtures/implicit-error-interfaces.mjs";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of ["native", "js"]) {
  for (const projectError of [false, true]) {
    test(`implicit Error interface preserves native identity and live fields: ${surface}/${projectError}`, { timeout: 300_000 }, () => {
      const compiled = compileCsharpSource({ surface, sourceText: implicitErrorInterfaceSource(projectError) });
      executeCsharpConstruction(compiled, `implicit-error-interface-${projectError}`, false);
    });
  }
}
