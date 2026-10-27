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

test("generic method values retain the original environment without a wrapper or delegate", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: genericObjectMethodValueSource });
  executeCsharpConstruction(compiled, "generic-object-method-values");
  const generated = [...compiled.artifacts.values()].join("\n");
  assert.doesNotMatch(generated, /DynamicInvoke|System\.Reflection|System\.Linq\.Expressions/u);
  assert.match(generated, /identity<[^>]+>/u);
  assert.doesNotMatch(generated, /Func<T,\s*T>\s+(?:identity|alias|escaped|selected)/u);
});

test("class structural views retain native reference identity across all value boundaries", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", files: classStructuralConversionFiles,
    sourceText: classStructuralConversionFiles["index.ts"] }), "class-structural-conversions");
  for (const sourceText of invalidClassStructuralConversions) {
    const invalid = checkCsharpSource({ surface: "js", sourceText });
    assert.match(invalid.sourceDiagnosticsText, /error TS/u);
  }
});

test("union calls compose generic, default, rest and async contracts without dispatch closures", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", files: unionCallContractsFiles,
    sourceText: unionCallContractsFiles["index.ts"] });
  executeCsharpConstruction(compiled, "union-call-contracts", true);
  const native = [...compiled.artifacts.values()].join("\n");
  assert.match(native, /private static [^\n]*__tsonic_union_call_/u);
  assert.doesNotMatch(native, /\.Match(?:<[^\n]+>)?\(/u);
  for (const sourceText of incompatibleUnionCalls) {
    const invalid = checkCsharpSource({ surface: "js", sourceText });
    assert.match(invalid.sourceDiagnosticsText, /error TS/u);
  }
});

test("optional indexed arguments retain absence and single evaluation", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: optionalIndexedArgumentsSource }), "optional-indexed-arguments");
});
