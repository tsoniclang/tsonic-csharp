import test from "node:test";
import { closedUnionCallbackCompletionSource, closedUnionValueCallbackCompletionSource } from "../../../../tsonic/test/fixtures/closed-union-callback-completion.mjs";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of [undefined, "js"]) {
  test(`finite native union callbacks retain checked absence completion on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ surface, sourceText: closedUnionValueCallbackCompletionSource }),
      "finite-union-callback-completion");
  });
  test(`closed-union callbacks retain checked absence completion on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ surface, sourceText: closedUnionCallbackCompletionSource }),
      "closed-union-callback-completion");
  });
}
