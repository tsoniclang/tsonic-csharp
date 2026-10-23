import assert from "node:assert/strict";
import test from "node:test";
import { createCompilerSessionFromFiles } from "@tsonic/tsts";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { analyzeCsharpSafetyEmission } from "../../../dist/analysis/safety/emission.js";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { csharpProgramSourceFiles } from "../../helpers/program-source-files.mjs";

for (const pointer of [false, true]) {
  test(`conditional-arm source admission retains unsafe permission: ${pointer}`, () => {
    const checked = createCompilerSessionFromFiles({
      currentDirectory: "/project",
      files: { "/project/index.ts": "declare function load(value: number): number; export function read(value: number): number { return value > 0 ? load(value) : 0; }" },
      compilerOptions: { noLib: true, strict: true, target: "esnext" },
    }).checkSource();
    const source = createTargetSourceProgram(checked);
    const file = checked.getSourceFile("/project/index.ts");
    const nodes = [];
    const visit = node => { nodes.push(node); source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); }); };
    visit(file);
    const call = nodes.find(node => source.ast.is.IsCallExpression(node));
    assert.equal(call !== undefined, true, "the checked conditional arm has its original source call");
    const absent = Object.freeze({ get: () => undefined });
    const result = analyzeCsharpSafetyEmission({
      source,
      configuration: { languageDialect: "csharp14", memorySafetyRules: "csharp14" },
      safety: { all: [], safetyOperation: absent, safetyApplication: { get: () => [] } },
      evidence: { nodeTargetType: absent, sourceField: absent },
      operations: { classPropertyStorage: absent, erasedStatement: absent,
        nativePointer: { get: node => pointer && node === call ? { kind: "load" } : undefined } },
      storage: { storageType: absent },
      shapes: { artifacts: [] },
      unions: { sourceUnions: { get: () => [] } },
      admitted: () => true,
    });
    const selected = result.records.unsafeEmission.get(call);
    assert.equal(selected.context, pointer, "the arm's exact native operation decides lexical unsafe context");
    assert.equal(selected.permission, pointer, "the arm's exact native operation decides project unsafe permission");
    assert.equal(result.records.unsafeCompilation.get(file), pointer, "the source decision reaches compilation permission before sealing");
    assert.deepEqual(result.issues.map(issue => issue.code), pointer ? ["CSHARP_NATIVE_POINTER_UNSAFE_CONTEXT_REQUIRED"] : []);
  });
}

for (const surface of ["native", "js"]) {
  test(`ordered comparisons demand their actual native carrier metadata in ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      let trace = "";
      function record(value: string, label: string): string { trace += label; return value; }
      export function classify(value: string, dynamicCase: string): string {
        trace = "";
        let result = "";
        switch (record(value, "input;")) {
          case record(dynamicCase, "first;"): result = "dynamic"; break;
          default: result = "default";
          case record("last", "last;"): result += "last";
        }
        return result + "|" + trace;
      }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    const { program } = compiled.result;
    const pending = [...csharpProgramSourceFiles(program)];
    let comparisons = 0;
    while (pending.length > 0) {
      const node = pending.pop();
      program.source.ast.forEachChild(node, child => { if (child !== undefined) pending.push(child); });
      const selected = program.records.switchStatement.get(node);
      if (selected?.kind !== "ordered") continue;
      for (const clause of selected.clauses) {
        const comparison = clause.comparison;
        if (comparison === undefined) continue;
        comparisons++;
        const carriers = [comparison.leftType, comparison.rightType, comparison.leftInputType,
          comparison.rightInputType, comparison.resultType];
        for (const carrier of carriers) {
          const metadata = program.records.typeEmission.get(carrier);
          assert.equal(metadata !== undefined, true, "each exact selected operation carrier has sealed metadata");
          assert.equal(metadata.completion, "value", "string operands and the synthetic comparison complete with native values");
        }
      }
    }
    assert.equal(comparisons, 2, "both original case expressions retain their admitted comparisons");
    const output = [...compiled.artifacts].filter(([path]) => path.endsWith(".cs")).map(([, text]) => text).join("\n");
    assert.equal(output.includes("first;"), true, "the first case effect remains emitted");
    assert.equal(output.includes("last;"), true, "the later case effect remains emitted");
  });
}
