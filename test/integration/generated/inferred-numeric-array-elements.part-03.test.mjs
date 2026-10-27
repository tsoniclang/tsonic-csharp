import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { compileCsharpNativeUseSource } from "../../helpers/expected-native-uses.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { getCsharpArrayLiteralElementTargetType } from "../../../dist/target-model/types/carriers/collections.js";
import { getCsharpRuntimeUnionArms } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { csharpJsArrayTargetType } from "../../../dist/target-model/types/carriers/js.js";
import { csharpEnumerableTargetType } from "../../../dist/target-model/types/carriers/collections.js";
import { combineCsharpTargetUnionMembers } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { targetTypeRefKey } from "../../../dist/target-model/types/equality.js";
import { isCsharpStringTargetType, isCsharpJsStringTargetType } from "../../../dist/target-model/types/identity.js";
import { csharpProgramSourceFiles } from "../../helpers/program-source-files.mjs";
import { destinationBodies, destinationPrograms, unionDestinationPrograms, sourceText, carriers, nativeArrayElements, physicalForms, operationControls, expectedOperationRefusals } from "./inferred-numeric-array-elements.fixtures.mjs";

for (const surface of Array.from(["native", "js"]).slice(1, 2)) {
for (const [formName, form, size] of Array.from(physicalForms).slice(0, 1)) {
for (const [operation, body] of Array.from(operationControls).slice(11, 15)) {
if (surface === "native" && !["number read", "order", "addition", "equality", "template"].includes(operation)) continue;

test(`C130 ${surface}: ${formName} ${operation} uses native number semantics or a precise pre-seal refusal`,
    { timeout: 300_000 }, () => {
      const expectedJson = size === 2 ? "[1,1]" : "[1,1,1]";
      const expectedSort = size === 2 ? "[10,2]" : "[1,10,2]";
      const sourceText = 'import type { int32, uint32 } from "@tsonic/core/types.js";\n' +
        `export function check(signed: int32, unsigned: uint32): boolean { const values = ${form}; ` +
        body.replace("EXPECTED_JSON", JSON.stringify(expectedJson)).replace("EXPECTED_SORT", JSON.stringify(expectedSort)) + " }";
      const compiled = compileCsharpNativeUseSource({ surface, sourceText });
      assert.equal(compiled.sourceDiagnosticsText === "", true, `${operation}: ${compiled.sourceDiagnosticsText}`);
      const errors = compiled.nativeStage.diagnostics.filter(issue => issue.category === "error");
      const root = new URL(`../../../.temp/C01-inferred-numeric-array-elements/operations/${surface}/${formName}/${operation.replace(/[^a-z]/giu, "-")}/`, import.meta.url);
      mkdirSync(root, { recursive: true });
      const diagnostic = issue => {
        const ast = compiled.nativeStage.source.ast;
        const range = issue.sourceNode === undefined ? undefined : ast.authoredRange(issue.sourceNode);
        const text = range?.kind !== "authored" ? undefined
          : ast.getSourceText(ast.getSourceFile(issue.sourceNode)).slice(range.start, range.end).trim();
        return { code: issue.code, message: issue.message, text };
      };
      writeFileSync(new URL("source-and-result.json", root), JSON.stringify({ sourceText,
        diagnostics: errors.map(diagnostic), artifacts: [...compiled.artifacts] }, null, 2));
      if (errors.length > 0) {
        assert.equal(compiled.result.program === undefined && compiled.artifacts.size === 0, true,
          "an unsupported cross-arm operation is refused before the seal and emits no artifact");
        const observed = errors.map(diagnostic).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
        const expected = expectedOperationRefusals(operation, size).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
        assert.equal(observed.length === expected.length && observed.every((issue, index) =>
          issue.code === expected[index].code && issue.message === expected[index].message && issue.text === expected[index].text), true,
        `${formName}/${operation}: the complete exact code, native reason and authored source node match its declared operation contract`);
        process.stdout.write(`C130 ${surface} ${formName} ${operation}: PRESEAL ${errors.map(issue => issue.code).join(",")}\n`);
        return;
      }
      assertCsharpCompilationSucceeded(compiled);
      const nativeProgram = `if (!Tsonic.Generated.Index.check(${operation === "sort" ? "10, 2" : "1, 1"}))
        throw new System.Exception("C130 ${formName} ${operation}: cross-arm number semantics");
        System.Console.WriteLine("C130 native operation passed");`;
      writeFileSync(new URL("native-program.cs", root), nativeProgram);
      const output = executeCsharpConstruction(compiled, `C130-${surface}-${formName}-${operation.replace(/[^a-z]/giu, "-")}`, false, false, [], nativeProgram);
      writeFileSync(new URL("native-output.txt", root), output);
      assert.equal(output.includes("C130 native operation passed"), true, "the real generated native operation observes exact cross-arm number semantics");
      process.stdout.write(`C130 ${surface} ${formName} ${operation}: NATIVE\n`);
    });
}
}

for (const [formName, form, size] of Array.from(physicalForms).slice(1, 2)) {
for (const [operation, body] of Array.from(operationControls).slice(0, 13)) {
if (surface === "native" && !["number read", "order", "addition", "equality", "template"].includes(operation)) continue;

test(`C130 ${surface}: ${formName} ${operation} uses native number semantics or a precise pre-seal refusal`,
    { timeout: 300_000 }, () => {
      const expectedJson = size === 2 ? "[1,1]" : "[1,1,1]";
      const expectedSort = size === 2 ? "[10,2]" : "[1,10,2]";
      const sourceText = 'import type { int32, uint32 } from "@tsonic/core/types.js";\n' +
        `export function check(signed: int32, unsigned: uint32): boolean { const values = ${form}; ` +
        body.replace("EXPECTED_JSON", JSON.stringify(expectedJson)).replace("EXPECTED_SORT", JSON.stringify(expectedSort)) + " }";
      const compiled = compileCsharpNativeUseSource({ surface, sourceText });
      assert.equal(compiled.sourceDiagnosticsText === "", true, `${operation}: ${compiled.sourceDiagnosticsText}`);
      const errors = compiled.nativeStage.diagnostics.filter(issue => issue.category === "error");
      const root = new URL(`../../../.temp/C01-inferred-numeric-array-elements/operations/${surface}/${formName}/${operation.replace(/[^a-z]/giu, "-")}/`, import.meta.url);
      mkdirSync(root, { recursive: true });
      const diagnostic = issue => {
        const ast = compiled.nativeStage.source.ast;
        const range = issue.sourceNode === undefined ? undefined : ast.authoredRange(issue.sourceNode);
        const text = range?.kind !== "authored" ? undefined
          : ast.getSourceText(ast.getSourceFile(issue.sourceNode)).slice(range.start, range.end).trim();
        return { code: issue.code, message: issue.message, text };
      };
      writeFileSync(new URL("source-and-result.json", root), JSON.stringify({ sourceText,
        diagnostics: errors.map(diagnostic), artifacts: [...compiled.artifacts] }, null, 2));
      if (errors.length > 0) {
        assert.equal(compiled.result.program === undefined && compiled.artifacts.size === 0, true,
          "an unsupported cross-arm operation is refused before the seal and emits no artifact");
        const observed = errors.map(diagnostic).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
        const expected = expectedOperationRefusals(operation, size).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
        assert.equal(observed.length === expected.length && observed.every((issue, index) =>
          issue.code === expected[index].code && issue.message === expected[index].message && issue.text === expected[index].text), true,
        `${formName}/${operation}: the complete exact code, native reason and authored source node match its declared operation contract`);
        process.stdout.write(`C130 ${surface} ${formName} ${operation}: PRESEAL ${errors.map(issue => issue.code).join(",")}\n`);
        return;
      }
      assertCsharpCompilationSucceeded(compiled);
      const nativeProgram = `if (!Tsonic.Generated.Index.check(${operation === "sort" ? "10, 2" : "1, 1"}))
        throw new System.Exception("C130 ${formName} ${operation}: cross-arm number semantics");
        System.Console.WriteLine("C130 native operation passed");`;
      writeFileSync(new URL("native-program.cs", root), nativeProgram);
      const output = executeCsharpConstruction(compiled, `C130-${surface}-${formName}-${operation.replace(/[^a-z]/giu, "-")}`, false, false, [], nativeProgram);
      writeFileSync(new URL("native-output.txt", root), output);
      assert.equal(output.includes("C130 native operation passed"), true, "the real generated native operation observes exact cross-arm number semantics");
      process.stdout.write(`C130 ${surface} ${formName} ${operation}: NATIVE\n`);
    });
}
}
}
