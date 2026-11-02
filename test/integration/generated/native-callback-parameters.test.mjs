import { assertNumericLiteralRefusal, numericCompoundRefusal } from "../../helpers/numeric-literal-rulings.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { nativeCallbackParametersSource } from "../../../../tsonic/test/fixtures/native-callback-parameters.mjs";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of [undefined, "js"]) {
  test(`native callbacks retain explicit local arithmetic (${surface ?? "native"})`, { timeout: 300_000 }, () => {
    const original = compileCsharpSource({ ...(surface === undefined ? {} : { surface }), sourceText: nativeCallbackParametersSource });
    assertNumericLiteralRefusal(original, [numericCompoundRefusal("+=", "captured += value")]);
    const compiled = compileCsharpSource({ ...(surface === undefined ? {} : { surface }),
      sourceText: nativeCallbackParametersSource.replace("let captured = 0", "let captured: number = 0") });
    assertCsharpCompilationSucceeded(compiled);
    assert.doesNotMatch(compiled.artifacts.get("src/Index.cs"), /dynamic|Convert\.ChangeType/u);
    executeCsharpConstruction(compiled, `native-callback-parameters-${surface ?? "native"}`, false, false, [], `
using System;
if (!Tsonic.Generated.Index.run()) throw new Exception("authored and inferred native callback arithmetic");
`);
  });
}
