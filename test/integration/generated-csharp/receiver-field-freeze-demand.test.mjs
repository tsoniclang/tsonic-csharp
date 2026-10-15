import test from "node:test";
import { retainedFieldFreezeOrigins, retainedFieldFreezeOriginSource, retainedFieldGenericFreezeSource } from "../../../../tsonic/test/fixtures/retained-field-freeze-origins.mjs";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const { name, declarations, invocation } of retainedFieldFreezeOrigins) {
  test(`retained direct writes observe ${name} freeze without guarding reads`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface: "js", sourceText: retainedFieldFreezeOriginSource(declarations, invocation) });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `retained-field-freeze-origin-${name}`);
  });
}

test("generic inherited field captures observe freeze through the exact structural instantiation", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: retainedFieldGenericFreezeSource });
  assertCsharpCompilationSucceeded(compiled);
  executeCsharpConstruction(compiled, "retained-field-freeze-generic-inherited");
});
