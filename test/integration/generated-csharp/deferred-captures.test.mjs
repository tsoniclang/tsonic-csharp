import test from "node:test";
import { deferredCapturesSource } from "../../../../tsonic/test/fixtures/deferred-captures.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";

for (const surface of [undefined, "js"]) {
  test(`deferred captures retain one initialized native activation on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ surface, sourceText: deferredCapturesSource }),
      `deferred-captures-${surface ?? "native"}`);
  });
}
