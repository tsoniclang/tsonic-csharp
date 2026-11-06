import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, compileCsharpAnalysisTarget, assertCsharpCompilationSucceeded } from "../../../helpers/direct-csharp-session.mjs";
import { memoryAbiCapability } from "../../../helpers/memory-abi.mjs";
import { getCsharpNullableElementTargetType } from "../../../../dist/target-model/types/carriers/nullable.js";
import { targetTypeRefEquals } from "../../../../dist/target-model/types/equality.js";

const sourceText = `
  import { abi } from "test:abi";
  import { memorylayout, allocateptr, torawptr, reinterpretrawptr, loadptr, storeptr, unsafecontext } from "@tsonic/core/lang.js";
  import type { uint32 } from "@tsonic/core/types.js";
  const word = memorylayout<uint32>({ datalayout: abi, bytesize: 4, bytealignment: 4, stride: 4, fields: [] });
  export function run(): boolean {
    unsafecontext();
    const pointer = allocateptr<uint32>(7);
    const raw = torawptr(pointer, word);
    const other = reinterpretrawptr(raw, word);
    const restored = reinterpretrawptr(raw, word);
    if (restored === undefined) return false;
    storeptr(restored, 9);
    return loadptr(pointer) === 9 && other !== undefined;
  }
`;

for (const surface of ["native", "js"]) {
  test(`${surface} published presence changes only the physical read, not its creation or storage`, () => {
    const compiled = compileCsharpSource({ surface, sourceText, capabilities: [memoryAbiCapability("csharp")] });
    assertCsharpCompilationSucceeded(compiled);
    const { source, records } = compiled.result.program;
    const ast = source.ast;
    const declaration = source.navigation.nodes.find(node => ast.is.IsVariableDeclaration(node) && ast.text(ast.name(node)) === "restored");
    const call = source.navigation.nodes.find(node => ast.is.IsCallExpression(node) &&
      ast.text(ast.as.AsCallExpression(node).Expression) === "storeptr");
    const read = call === undefined ? undefined : ast.arguments(call)[0];
    const publication = declaration === undefined ? undefined : source.effectiveTypes.get(declaration);
    const record = read === undefined ? undefined : records.valueRead.get(read);
    const stored = record === undefined ? undefined : getCsharpNullableElementTargetType(record.flowReadStorage);
    assert.equal(publication !== undefined && publication.kind !== "refused" && publication.type.kind === "optional", true,
      "the exact original declaration remains optional");
    assert.equal(stored !== undefined && record !== undefined && targetTypeRefEquals(stored, record.value), true,
      "the present value keeps the identical physical pointee while its principal storage still admits absence");
  });

  for (const mode of ["missing", "foreign", "mismatched"]) {
    test(`${surface} ${mode} principal publication cannot prove a present physical read`, () => {
      let requested = 0;
      const compiled = compileCsharpSource({ surface, sourceText, capabilities: [memoryAbiCapability("csharp")],
        compileTarget(request, observer) {
          const original = request.input.source;
          const ast = original.ast;
          const declaration = original.navigation.nodes.find(node => ast.is.IsVariableDeclaration(node) && ast.text(ast.name(node)) === "restored");
          const foreign = original.navigation.nodes.find(node => ast.is.IsVariableDeclaration(node) && ast.text(ast.name(node)) === "other");
          assert.equal(declaration !== undefined && foreign !== undefined, true, "both are original distinct Source declarations");
          const actual = original.effectiveTypes.get(declaration);
          const effectiveTypes = { ...original.effectiveTypes, get(node) {
            if (node !== declaration) return original.effectiveTypes.get(node);
            requested += 1;
            return mode === "missing" ? undefined : mode === "foreign" ? original.effectiveTypes.get(foreign)
              : { ...actual, type: { kind: "optional", value: { kind: "intrinsic", intrinsic: "object" } } };
          } };
          return compileCsharpAnalysisTarget({ ...request, input: { ...request.input, source: { ...original, effectiveTypes } } }, observer);
        },
      });
      assert.equal(compiled.sourceDiagnosticsText, "", "the original checked program remains unchanged and valid");
      assert.equal(requested > 0, true, "the original principal publication is actually consumed");
      assert.equal(compiled.targetDiagnostics.length > 0 && compiled.result.program === undefined && compiled.artifacts.size === 0, true,
        "missing or unrelated Source authority cannot erase physical absence");
    });
  }
}
