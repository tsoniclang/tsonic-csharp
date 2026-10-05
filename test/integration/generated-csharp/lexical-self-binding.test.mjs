import test from "node:test";
import { lexicalSelfBindingSource } from "../../../../tsonic/test/fixtures/lexical-self-binding.mjs";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of ["native", "js"]) {
  test(`fixed self and written lexical bindings retain distinct native identities in ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: lexicalSelfBindingSource });
    executeCsharpConstruction(compiled, `lexical-self-binding-${surface}`,
      false, false, [], "Tsonic.Generated.Index.main();");
  });
}
