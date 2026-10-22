import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { guardedOptionalMemberSource, rejectedCallableConditionSource, rejectedGenericCarrierSource } from "../../../../tsonic/test/fixtures/guarded-optional-members.mjs";

for (const surface of [undefined, "js"]) {
  test(`guarded optional members retain native payloads (${surface ?? "native"})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: guardedOptionalMemberSource });
    executeCsharpConstruction(compiled, `guarded-optional-members-${surface ?? "native"}`);
    const generated = [...compiled.artifacts.values()].join("\n");
    assert.match(generated, /\blong\b/u);
    assert.doesNotMatch(generated, /BigInteger|\(double\)\s*exact/u);
  });

  test(`optional callables do not acquire implicit native truthiness (${surface ?? "native"})`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: rejectedCallableConditionSource });
    assert.ok(compiled.targetDiagnostics.some(diagnostic => diagnostic.category === "error"));
    assert.equal(compiled.artifacts.size, 0);
  });

  test(`inferred generic construction preserves required native signedness (${surface ?? "native"})`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: rejectedGenericCarrierSource });
    assert.ok(compiled.targetDiagnostics.some(diagnostic => diagnostic.category === "error"));
    assert.equal(compiled.artifacts.size, 0);
  });
}
