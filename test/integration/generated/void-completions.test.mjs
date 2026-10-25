import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { voidCompletionSource } from "../../../../tsonic/test/fixtures/void-completions.mjs";
import { csharpVoidReturnCompletion } from "../../../dist/policy/conversions/callable-completions.js";
import { csharpAbsenceTargetType } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { csharpSourcePrimitiveTargetType, csharpVoidTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { csharpNullableTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { selectDelegateConversion } from "../../../dist/policy/conversions/carriers.js";
import { csharpDelegateTargetType } from "../../../dist/target-model/types/carriers/delegates.js";

test("native absence return completion stays distinct from delegate result erasure", () => {
  const absent = csharpAbsenceTargetType();
  const value = csharpSourcePrimitiveTargetType("int32");
  assert.equal(csharpVoidReturnCompletion(absent, absent), "absence", "an actual absent source retains its physical absence return");
  assert.equal(csharpVoidReturnCompletion(absent, csharpNullableTargetType(value)), "absence", "the actual optional native destination admits absence");
  assert.equal(csharpVoidReturnCompletion(absent, csharpVoidTargetType()), "void", "a native void destination discards absence honestly");
  assert.equal(csharpVoidReturnCompletion(value, absent) === undefined, true, "present native values never become absence");
  assert.equal(csharpVoidReturnCompletion(absent, value) === undefined, true, "a nonoptional native destination never receives fabricated absence");
  const callback = csharpDelegateTargetType("System.Func", [], absent);
  const conversion = selectDelegateConversion({}, callback, callback);
  assert.equal(conversion?.kind === "delegate-adapter" && conversion.strategy === "native-binding" &&
    conversion.returnConversion.kind === "identity", true, "identical native absent-return signatures keep identity, not void erasure");
});

for (const surface of ["native", "js"]) {
  test(`void adaptation retains the physical lambda body completion on ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: voidCompletionSource });
    assertCsharpCompilationSucceeded(compiled);
    const program = compiled.result.program;
    assert.equal(program !== undefined, true, "the complete native lambda program is admitted");
    let lambdas = 0;
    const visit = node => {
      if (program.source.ast.is.IsArrowFunction(node)) {
        lambdas += 1;
        assert.equal(program.records.lambdaBody.get(node)?.completion, "absence",
          "the physical value-returning lambda produces absence before its contextual void adapter");
      }
      program.source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
    };
    program.source.navigation.sourceFiles.forEach(visit);
    assert.equal(lambdas, 1, "the authored callback is inspected exactly once");
  });

  test(`void completions preserve effects and native absence on ${surface}`, { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ surface, sourceText: voidCompletionSource }), `void-completions-${surface}`);
  });
}
