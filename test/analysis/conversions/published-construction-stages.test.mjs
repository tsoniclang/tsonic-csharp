import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeSourceLiteralValues } from "@tsonic/target-api/source";
import { withCsharpSessionRequest } from "../../helpers/direct-csharp-session.mjs";
import { analyzeCsharpValueReadStages } from "../../../dist/analysis/conversions/value-read-stages.js";
import { representCsharpSourceType } from "../../../dist/policy/types/source-type-flow/representation.js";
import { csharpTsValueTargetType } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";

for (const surface of ["native", "js"]) {
  test(`${surface} array literal stages consume their exact published construction before unknown storage`, () => {
    const observed = withCsharpSessionRequest({ surface, sourceText: `
      function accept(value: unknown): void {}
      export function run(): void { accept([1, 2]); }
    ` }, request => {
      const source = request.input.source;
      assert.equal(source.navigation.sourceFiles.length, 1, "one original project file owns this Source session");
      const file = source.navigation.sourceFiles[0];
      let array;
      const visit = node => {
        if (source.ast.is.IsArrayLiteralExpression(node)) array = node;
        source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
      };
      visit(file);
      assert.equal(array !== undefined, true, "the original Source array occurrence exists");
      const outcome = source.effectiveTypes.get(array);
      assert.equal(outcome?.kind !== "refused" && outcome?.construction?.kind === "array" &&
        outcome.construction.element.kind === "primitive" && outcome.construction.element.primitive === "int64", true,
      "the same occurrence publishes the complete int64 array construction");
      const representation = { target: request.input.target };
      const expected = representCsharpSourceType(representation, outcome.construction);
      assert.equal(expected !== undefined, true, "the existing representation owns the surface-specific array carrier");
      const none = Object.freeze({ get: () => undefined });
      const storage = csharpTsValueTargetType();
      const analyze = effectiveTypes => analyzeCsharpValueReadStages({ ast: source.ast, sourceFiles: [file],
        literalValues: analyzeSourceLiteralValues(source.ast, [file]), effectiveTypes,
        types: { sourceTypeFlowRepresentation: node => {
          assert.equal(node === array, true, "representation uses the identical Source occurrence");
          return representation;
        } } }, { nodeTargetType: { get: node => node === array ? storage : undefined },
        storageTargetType: none, readStorageTargetType: none, valueRefinement: none, yield: none },
      { operationResultType: none, sourceMember: none });
      const actual = analyze(source.effectiveTypes);
      const stage = actual.valueReadStages.get(array);
      assert.equal(targetTypeRefEquals(stage?.literalTarget, expected), true,
        "literal admission consumes the published construction, not enclosing unknown storage");
      assert.equal(targetTypeRefEquals(stage?.operationValue, expected) && targetTypeRefEquals(stage?.returnedValue, expected), true,
        "all pre-storage value stages retain the same physical producer");
      const missing = analyze({ get: () => undefined });
      assert.equal(missing.valueReadStages.get(array)?.literalTarget === storage, true,
        "missing Source construction never guesses the present array carrier");
      const withoutConstruction = analyze({ get: node => node === array ? { ...outcome, construction: undefined } : undefined });
      assert.equal(withoutConstruction.valueReadStages.get(array)?.literalTarget === storage, true,
        "the logical outcome is not an alternate array-construction chooser");
      return true;
    });
    assert.equal(observed.value, true, "the normal Source session reaches the stage assertions");
  });
}
