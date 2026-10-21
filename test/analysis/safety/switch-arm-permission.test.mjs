import assert from "node:assert/strict";
import test from "node:test";
import { createCompilerSessionFromFiles } from "@tsonic/tsts";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { analyzeCsharpSafetyEmission } from "../../../dist/analysis/safety/emission.js";

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
      operations: { classPropertyStorage: absent, nativePointer: { get: node => pointer && node === call ? { kind: "load" } : undefined } },
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
