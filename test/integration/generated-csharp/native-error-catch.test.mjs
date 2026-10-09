import test from "node:test";
import { nativeErrorCatchFunctionSource, nativeErrorCatchSource } from "../../../../tsonic/test/fixtures/native-error-catch.mjs";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of ["native", "js"]) {
  test(`closed native callback catch preserves its native readonly Error carrier (${surface})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: nativeErrorCatchSource });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `native-error-catch-${surface}`);
  });
  test(`native callback catch owns its selected native Error view (${surface})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: nativeErrorCatchFunctionSource });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `native-error-catch-open-${surface}`, false, false, [], `
using System;
using Generated = Tsonic.Generated.Index;

var original = new Tsonic.CSharp.Runtime.Error("original");
if (!ReferenceEquals(Generated.invoke(() => { throw original; }), original.message))
    throw new Exception("original native Error message identity");
var native = new InvalidOperationException("native");
if (!ReferenceEquals(Generated.invoke(() => { throw native; }), native.Message))
    throw new Exception("original native exception message identity");
if (Generated.invoke(() => {}) != "success") throw new Exception("callback success");
`);
  });
}
