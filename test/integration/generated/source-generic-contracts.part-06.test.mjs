import assert from "node:assert/strict";
import test from "node:test";
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

test("native params preserve array-valued arguments and nested storage identity", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: nestedArrayRestSource });
  executeCsharpConstruction(compiled, "nested-array-rest");
  assert.match(compiled.artifacts.get("src/Index.cs"), /values\.push\(first\);/u);
});

test("native optional array equality preserves identity, repeated reads and mutation snapshots", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: optionalArrayComparisonSource }),
    "optional-array-comparisons");
});

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
  executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: genericObjectCaptureSource }), "generic-object-captures");
});
