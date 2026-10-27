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

test("generic absence arrays retain native storage and aliases", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: nativeAbsenceArraySource }), "native-absence-js-arrays");
});

test("JS surface absence keeps membership and native values", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: nativeAbsenceJsSource });
  executeCsharpConstruction(compiled, "native-absence-js-collections");
  const program = compiled.result.program;
  assert.equal(program !== undefined, true, "the complete absence and identity program is admitted");
  let selected = 0;
  const visit = node => {
    const target = program.records.selectedCall.get(node)?.target;
    if (target?.kind === "resolved" && target.call.targetMember.id === "Tsonic.CSharp.Js.Object.is") {
      selected += 1;
      assert.equal(target.call.targetMember.parameters.length === 2 && target.call.targetMember.parameters.every(parameter =>
        targetTypeRefEquals(getCsharpNullableElementTargetType(parameter.type), csharpObjectTargetType())), true,
      "Object.is publishes its actual two object? native formals, not a broad conversion permission");
    }
    program.source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  program.source.navigation.sourceFiles.forEach(visit);
  assert.equal(selected, 1, "the actual selected native identity helper is checked exactly once");
});

for (const surface of Array.from([undefined, "js"]).slice(0, 2)) {
test(`one native absence preserves values, aliases and evaluation (${surface ?? "native"})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: nativeAbsenceSource });
    executeCsharpConstruction(compiled, `native-absence-${surface ?? "native"}`);
    const output = [...compiled.artifacts.values()].join("\n");
    assert.doesNotMatch(output, /Runtime\.(?:Null|Undefined|Optional)</u);
    assert.match(output, /long\?/u);
  });
}

test("native option fields check dynamic values before use", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", capabilities: [nodejsCapability()], sourceText: nativeOptionRuntimeSource });
  executeCsharpConstruction(compiled, "native-option-fields", false, false,
    [join(testRepositoryRoots.csharpNodejs, "csharp/src/Tsonic.CSharp.Node/Tsonic.CSharp.Node.csproj")]);
});
