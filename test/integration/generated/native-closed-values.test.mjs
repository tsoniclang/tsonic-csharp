import assert from "node:assert/strict";
import test from "node:test";
import { nativeClosedValuesSource, nativeClosedValuesSourceForEmpty } from "../../../../tsonic/test/fixtures/native-closed-values.mjs";
import { assertCsharpCheckingSucceeded, assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of [undefined, "js"]) {
  test(`native closed values retain exact primitive, absence and shared-object operations in ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const original = compileCsharpSource({ surface, sourceText: nativeClosedValuesSource });
    assertCsharpCheckingSucceeded(original);
    const issues = original.targetDiagnostics.filter(diagnostic => diagnostic.category === "error");
    assert.equal(issues.length, 1, "one opaque empty producer owns the refusal");
    const issue = issues[0];
    assert.equal(issue.code, "TSONIC_UNTYPED_OBJECT_LITERAL");
    assert.equal(issue.message, "This object literal has no target type. Declare a type for 'empty' at this initializer.");
    const range = issue.sourceNode === undefined ? undefined : original.source.ast.authoredRange(issue.sourceNode);
    const start = nativeClosedValuesSource.indexOf("{}", nativeClosedValuesSource.indexOf("const empty"));
    assert.equal(range?.kind === "authored" && range.start === start && range.end === start + 2, true,
      "the original empty initializer, not a later opaque call, owns the refusal");
    assert.equal(original.result.program === undefined && original.result.plan === undefined && original.artifacts.size === 0,
      true, "an untyped opaque escape publishes nothing");
    const compiled = compileCsharpSource({ surface, sourceText: nativeClosedValuesSourceForEmpty(": object") });
    assertCsharpCompilationSucceeded(compiled);
    const source = [...compiled.artifacts.values()].join("\n");
    assert.match(source, /\.isUndefined\(\)/);
    assert.doesNotMatch(source, /ApplyDynamicLogical/);
    executeCsharpConstruction(compiled, `native-closed-values-${surface ?? "native"}`);
  });
}
