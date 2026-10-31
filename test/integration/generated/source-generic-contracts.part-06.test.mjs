import assert from "node:assert/strict";
import test from "node:test";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { join } from "node:path";
import { assertCsharpCompilationSucceeded, checkCsharpSource, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { optionalIndexedArgumentsSource } from "../../../../tsonic/test/fixtures/optional-indexed-arguments.mjs";
import { unionCallContractsFiles, incompatibleUnionCalls } from "../../../../tsonic/test/fixtures/union-call-contracts.mjs";
import { classStructuralConversionFiles, invalidClassStructuralConversions } from "../../../../tsonic/test/fixtures/class-structural-conversions.mjs";
import { genericObjectMethodFiles, genericObjectCaptureSource, genericObjectMethodValueSource, invalidGenericObjectMethods } from "../../../../tsonic/test/fixtures/generic-object-methods.mjs";
import { nestedArrayRestSource } from "../../../../tsonic/test/fixtures/nested-array-rest.mjs";
import { optionalArrayComparisonSource } from "../../../../tsonic/test/fixtures/optional-array-comparisons.mjs";
import { nestedStructuralStorageFiles, invalidNestedStructuralStorageFiles } from "../../../../tsonic/test/fixtures/nested-structural-storage.mjs";
import { bigintSwitchSource } from "../../../../tsonic/test/fixtures/bigint-switch.mjs";
import { classFactoryEffectsFiles } from "../../../../tsonic/test/fixtures/class-factory-effects.mjs";
import { authoredLocalTypesFiles } from "../../../../tsonic/test/fixtures/authored-local-types.mjs";
import { tupleSatisfiesSource, invalidTupleSatisfiesSources } from "../../../../tsonic/test/fixtures/tuple-satisfies.mjs";
import { initializedModuleStateFiles } from "../../../../tsonic/test/fixtures/initialized-module-state.mjs";
import { nativeIntegerComplementSource } from "../../../../tsonic/test/fixtures/native-integer-complement.mjs";
import { nullishNeverSource } from "../../../../tsonic/test/fixtures/nullish-never.mjs";
import { pointerOwnerNarrowingSource } from "../../../../tsonic/test/fixtures/pointer-owner-narrowing.mjs";
import { bigintTruncationSource } from "../../../../tsonic/test/fixtures/bigint-truncation.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { csharpProgramSourceFiles } from "../../helpers/program-source-files.mjs";

test("generic object methods retain native binders, independent bodies and shared captures", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", files: genericObjectMethodFiles,
    sourceText: genericObjectMethodFiles["index.ts"] });
  executeCsharpConstruction(compiled, "generic-object-methods");
  const shapes = compiled.artifacts.get("generated/TsonicObjectShapes.cs");
  assert.match(shapes, /identity<[TU]>\([TU] value\)/u);
  assert.doesNotMatch(shapes, /(?:Func|Action)<[TU](?:, [TU])?> __tsonic_method/u);
  assert.doesNotMatch(shapes, /DynamicInvoke|System\.Reflection|System\.Linq\.Expressions/u);
  for (const sourceText of invalidGenericObjectMethods) {
    const invalid = checkCsharpSource({ surface: "js", sourceText });
    assert.match(invalid.sourceDiagnosticsText, /error TS/u);
  }
});

test("generic method captures preserve parameters, destructuring and loop activation identity", { timeout: 300_000 }, () => {
  const refused = compileCsharpSource({ surface: "js", sourceText: genericObjectCaptureSource });
  assert.deepEqual(refused.result.diagnostics.map(({ code, message }) => ({ code, message })), Array.from({ length: 2 }, () => ({
    code: "CSHARP_UNSUPPORTED_AST",
    message: "The loop-header expression captures a per-iteration loop binding; move the callback into the loop body.",
  })));
  assert.equal(refused.artifacts.size, 0, "header capture refusal emits no artifacts");
  const checked = createTargetSourceProgram(refused.source);
  const loops = [];
  const visit = node => {
    if (checked.ast.is.IsForStatement(node)) loops.push(node);
    checked.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  const diagnosticNode = refused.result.diagnostics[0]?.sourceNode;
  assert.equal(diagnosticNode !== undefined, true, "the original header refusal has a checked source owner");
  visit(checked.ast.getSourceFile(diagnosticNode));
  assert.equal(loops.length, 4, "all original generic capture loops remain");
  const loop = checked.ast.as.AsForStatement(loops[1]);
  for (const [index, header] of [loop.Condition, loop.Incrementor].entries()) {
    assert.equal(refused.result.diagnostics[index]?.sourceNode === header, true,
      `header ${index}: the original expression owns the refusal`);
  }
  const sourceText = genericObjectCaptureSource
    .replace("    const conditions: (() => number)[] = [];\n    const increments: (() => number)[] = [];\n", "")
    .replace("for (let index = 0; (conditions.push(() => index), index < 3); (increments.push(() => index), index++))",
      "for (let index = 0; index < 3; index++)")
    .replace("return conditions[0]() === 0 && conditions[1]() === 1 && conditions[3]() === 3 &&\n      increments[0]() === 1 && increments[1]() === 2 && increments[2]() === 3;", "return true;");
  const compiled = compileCsharpSource({ surface: "js", sourceText });
  assertCsharpCompilationSucceeded(compiled);
  const source = [...compiled.artifacts].filter(([path]) => path.endsWith(".cs")).map(([, text]) => text).join("\n");
  assert.match(source, /for\s*\(/u);
  assert.doesNotMatch(source, /while\s*\(true\)/u);
  executeCsharpConstruction(compiled, "generic-object-captures");
});
