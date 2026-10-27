import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { testRepositoryRoots } from "../../../../tsonic/test/scripts/workspace-layout.mjs";
import { nativeNumericArraysSource } from "../../../../tsonic/test/fixtures/native-numeric-arrays.mjs";
import { createTsonicPlugin as nodejsCapability } from "../../../../csharp-nodejs/dist/index.js";
import { selectedConstructorFiles } from "../../../../tsonic/test/fixtures/selected-constructors.mjs";
import { nativeSurfaceResultsSource, nativeNodeResultsSource } from "../../../../tsonic/test/fixtures/native-surface-results.mjs";
import { nativeOptionRuntimeSource } from "../../../../tsonic/test/fixtures/native-process-options.mjs";
import { nativeAbsenceSource, nativeAbsenceJsSource, nativeAbsenceArraySource } from "../../../../tsonic/test/fixtures/native-absence.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { csharpObjectTargetType, getCsharpNullableElementTargetType, targetTypeRefEquals } from "../../../dist/target-model/types/index.js";

test("native JS result carriers preserve widths, aliases and API behavior", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: nativeSurfaceResultsSource });
  // setTimeout and setInterval schedule on the active JavaScript event loop, so the entry runs inside it.
  executeCsharpConstruction(compiled, "native-surface-results", false, false, [],
    "Tsonic.CSharp.Js.JsEventLoop.Run(() => { if (!Tsonic.Generated.Index.run()) throw new System.Exception(\"native JS result carriers\"); });");
  const text = [...compiled.artifacts.values()].join("\n");
  assert.match(text, /uint word\b/u);
  assert.match(text, /float single\b/u);
  assert.match(text, /uint first\b/u);
  assert.match(text, /int timer\b/u);
  assert.match(text, /int interval\b/u);
});
