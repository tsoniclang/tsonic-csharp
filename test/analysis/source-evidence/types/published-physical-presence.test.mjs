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

// The project nodes of a TargetSourceProgramFacts in preorder (authored-syntax walk; nextgen C-2542: the raw
// navigation node inventory is not public).
function projectNodes(source) {
  const ast = source.syntax;
  const nodes = [];
  const visit = node => { nodes.push(node); ast.forEachChild(node, child => { if (child !== undefined) visit(child); }); };
  for (const file of source.sourceFiles) if (!ast.isDeclarationFile(file)) visit(file);
  return nodes;
}

for (const surface of ["native", "js"]) {
  test(`${surface} published presence changes only the physical read, not its creation or storage`, () => {
    const compiled = compileCsharpSource({ surface, sourceText, capabilities: [memoryAbiCapability("csharp")] });
    assertCsharpCompilationSucceeded(compiled);
    const { source, records } = compiled.result.program;
    const ast = source.syntax;
    const nodes = projectNodes(source);
    const declaration = nodes.find(node => ast.is.IsVariableDeclaration(node) && ast.text(ast.name(node)) === "restored");
    const call = nodes.find(node => ast.is.IsCallExpression(node) &&
      ast.text(ast.as.AsCallExpression(node).Expression) === "storeptr");
    const read = call === undefined ? undefined : ast.arguments(call)[0];
    const publication = declaration === undefined ? undefined : source.facts.values.type(declaration);
    const record = read === undefined ? undefined : records.valueRead.get(read);
    const stored = record === undefined ? undefined : getCsharpNullableElementTargetType(record.flowReadStorage);
    assert.equal(publication !== undefined && publication.kind !== "refused" && publication.type.kind === "optional", true,
      "the exact original declaration remains optional");
    assert.equal(stored !== undefined && record !== undefined && targetTypeRefEquals(stored, record.value), true,
      "the present value keeps the identical physical pointee while its principal storage still admits absence");
  });

  // nextgen C-2542: the Host publication is total (I4), so "missing" (undefined) is no longer a value of the contract.
  // Its opposite is a Host refusal that reaches C# unforwarded: an analysis invariant failure, never a proof.
  // The declaration's value type and its slot are both replaced (C# may read either for the principal storage).
  for (const mode of ["refused", "foreign", "mismatched"]) {
    test(`${surface} ${mode} principal publication cannot prove a present physical read`, () => {
      let requested = 0;
      const compiled = compileCsharpSource({ surface, sourceText, capabilities: [memoryAbiCapability("csharp")],
        compileTarget(request, observer) {
          const original = request.input.source;
          const ast = original.syntax;
          const nodes = projectNodes(original);
          const declaration = nodes.find(node => ast.is.IsVariableDeclaration(node) && ast.text(ast.name(node)) === "restored");
          const foreign = nodes.find(node => ast.is.IsVariableDeclaration(node) && ast.text(ast.name(node)) === "other");
          assert.equal(declaration !== undefined && foreign !== undefined, true, "both are original distinct Source declarations");
          const values = original.facts.values;
          const refused = { kind: "refused", code: "TSONIC_FIXTURE_REFUSAL", message: "fixture refusal", reason: "fixture refusal",
            site: declaration };
          const objectType = { kind: "optional", value: { kind: "intrinsic", intrinsic: "object" } };
          const replace = read => node => {
            if (node !== declaration) return read(node);
            requested += 1;
            const actual = read(declaration);
            return mode === "refused" ? refused : mode === "foreign" ? read(foreign) : { ...actual, type: objectType };
          };
          const facts = { ...original.facts, values: { ...values, type: replace(values.type), slot: replace(values.slot) } };
          return compileCsharpAnalysisTarget({ ...request, input: { ...request.input, source: { ...original, facts } } }, observer);
        },
      });
      assert.equal(compiled.sourceDiagnosticsText, "", "the original checked program remains unchanged and valid");
      assert.equal(requested > 0, true, "the original principal publication is actually consumed");
      assert.equal(compiled.targetDiagnostics.length > 0 && compiled.result.program === undefined && compiled.artifacts.size === 0, true,
        "refused or unrelated Source authority cannot erase physical absence");
      if (mode === "refused") assert.equal(compiled.targetDiagnostics.some(diagnostic =>
        diagnostic.code === "TSONIC_INTERNAL_ANALYSIS_INVARIANT"), true, "an unforwarded Host refusal is an invariant failure (I4)");
    });
  }
}
