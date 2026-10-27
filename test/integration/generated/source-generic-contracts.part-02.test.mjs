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

test("class factories retain distinct evaluation and constructor exception boundaries", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", files: classFactoryEffectsFiles,
    sourceText: classFactoryEffectsFiles["index.ts"] }), "class-factory-effects");
});

test("local class scopes preserve authored names and cross-file generic instance identities", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", files: authoredLocalTypesFiles,
    sourceText: authoredLocalTypesFiles["index.ts"] });
  assertCsharpCompilationSucceeded(compiled);
  const generated = [...compiled.artifacts.values()].join("\n");
  assert.equal([...generated.matchAll(/\bclass Entry\b/g)].length, 4);
  assert.match(generated, /\breadValue\(/);
  assert.doesNotMatch(generated, /\bclass Entry__\d/);
  executeCsharpConstruction(compiled, "authored-local-types");
});

test("generic class statics share one native owner across closed instance types", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ sourceText: `
    import type { int32 } from "@tsonic/core/types.js";
    let effects: int32 = 0;
    function initialize(): int32 { effects += 1; return 0; }
    class Box<Value> {
      static count: int32 = initialize();
      value: Value;
      constructor(value: Value) { this.value = value; Box.count += 1; }
      static from<Value>(value: Value): Box<Value> { return new Box(value); }
    }
    function count(): int32 { return Box.count; }
    function effectCount(): int32 { return effects; }
    export function run(): boolean {
      if (count() !== 0 || effectCount() !== 1) return false;
      const number = Box.from<int32>(7 as int32);
      const text = Box.from<string>("stored");
      return number.value === 7 && text.value === "stored" && count() === 2 && effectCount() === 1;
    }
  ` });
  executeCsharpConstruction(compiled, "generic-class-static-owner");
  const generated = [...compiled.artifacts.values()].join("\n");
  assert.match(generated, /static class Box\b/u);
  assert.equal((generated.match(/static int count\s*(?:=|;)/gu) ?? []).length, 1);
});

test("bigint switches preserve wide equality, evaluation order and fallthrough", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: bigintSwitchSource }), "bigint-switch");
});

for (const surface of Array.from([undefined, "js"]).slice(0, 2)) {
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
