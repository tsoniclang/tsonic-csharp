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

for (const surface of Array.from(Array.from([undefined, "js"]).slice(0, 2)).slice(1, 2)){
const profile = surface ?? "native";

test(`nested structural storage preserves compound aliases and shared mutation (${profile})`, { timeout: 300_000 }, () => {
    const options = surface === undefined ? {} : { surface };
    executeCsharpConstruction(compileCsharpSource({ ...options, files: nestedStructuralStorageFiles,
      sourceText: nestedStructuralStorageFiles["index.ts"] }), `nested-structural-storage-${profile}`);
    for (const files of invalidNestedStructuralStorageFiles) {
      const invalid = checkCsharpSource({ ...options, files, sourceText: files["index.ts"] });
      assert.match(invalid.sourceDiagnosticsText, /error TS(?:2322|2345)/u);
    }
  });
}
