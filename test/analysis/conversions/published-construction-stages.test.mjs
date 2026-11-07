// An array literal written into `unknown` storage keeps the exact construction the Host published for it
// (facts.values.type(node).construction), represented through the one mapping (representation/, I6).
// Ported from the c2529 after-image (nextgen C-2542): the deleted representCsharpSourceType /
// resolveCsharpPublishedSourceSum are replaced by representSourceType over the same Host facts.
import assert from "node:assert/strict";
import { test } from "node:test";
import { withCsharpSessionRequest } from "../../helpers/direct-csharp-session.mjs";
import { analyzeCsharpValueReadStages } from "../../../dist/analysis/conversions/value-read-stages.js";
import { csharpRepresentationContext, representSourceType } from "../../../dist/representation/index.js";
import { csharpTsValueTargetType } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";
import { representationServices } from "../../representation/host-fixture.mjs";

for (const surface of ["native", "js"]) {
  test(`${surface} array literal stages consume their exact published construction before unknown storage`, () => {
    const observed = withCsharpSessionRequest({ surface, sourceText: `
      function accept(value: unknown): void {}
      export function run(): void { accept([1, 2]); }
    ` }, request => {
      const source = request.input.source;
      assert.equal(source.sourceFiles.length, 1, "one original project file owns this Source session");
      const file = source.sourceFiles[0];
      let array;
      const visit = node => {
        if (source.syntax.is.IsArrayLiteralExpression(node)) array = node;
        source.syntax.forEachChild(node, child => { if (child !== undefined) visit(child); });
      };
      visit(file);
      assert.equal(array !== undefined, true, "the original Source array occurrence exists");
      const outcome = source.facts.values.type(array);
      assert.equal(outcome?.kind !== "refused" && outcome?.construction?.kind === "array" &&
        outcome.construction.element.kind === "primitive" && outcome.construction.element.primitive === "int64", true,
      "the same occurrence publishes the complete int64 array construction");
      const services = representationServices({ facts: source.facts, ast: source.syntax,
        host: { sourceFacts: source.sourceFacts }, nodes: [] }, { profile: surface === "js" ? "js" : "native" });
      const expected = representSourceType(outcome.construction, csharpRepresentationContext(services, array, "value"));
      assert.equal(expected.kind === "csharp-refused", false, "the one representation owns the surface-specific array carrier");
      const int64 = csharpSourcePrimitiveTargetType("int64");
      assert.equal(surface === "js"
        ? expected.id === "Tsonic.CSharp.Js.JSArray`1" && targetTypeRefEquals(expected.typeArguments[0], int64)
        : expected.kind === "array" && targetTypeRefEquals(expected.element, int64), true,
      "native profile: long[]; JS profile: JSArray<long>");
      const none = Object.freeze({ get: () => undefined });
      const storage = csharpTsValueTargetType();
      const analyze = type => analyzeCsharpValueReadStages({ ast: source.syntax, sourceFiles: [file],
        facts: { ...source.facts, values: { ...source.facts.values, type } },
        types: { represent: (descriptor, node, position) => {
          assert.equal(node === array, true, "representation uses the identical Source occurrence");
          return representSourceType(descriptor, csharpRepresentationContext(services, node, position));
        } } }, { nodeTargetType: { get: node => node === array ? storage : undefined },
        storageTargetType: none, readStorageTargetType: none, valueRefinement: none, yield: none },
      { operationResultType: none, sourceMember: none });
      const actual = analyze(source.facts.values.type);
      const stage = actual.valueReadStages.get(array);
      assert.equal(targetTypeRefEquals(stage?.literalTarget, expected), true,
        "literal admission consumes the published construction, not enclosing unknown storage");
      assert.equal(targetTypeRefEquals(stage?.operationValue, expected) && targetTypeRefEquals(stage?.returnedValue, expected), true,
        "all pre-storage value stages retain the same physical producer");
      const refused = analyze(node => node === array ? Object.freeze({ kind: "refused", code: "TSONIC_LOCAL_TYPE_UNSUPPORTED",
        message: "fixture refusal", site: array }) : source.facts.values.type(node));
      assert.equal(refused.valueReadStages.get(array)?.literalTarget === storage, true,
        "a refused Source construction never guesses the present array carrier");
      const withoutConstruction = analyze(node => node === array ? { ...outcome, construction: undefined } : source.facts.values.type(node));
      assert.equal(withoutConstruction.valueReadStages.get(array)?.literalTarget === storage, true,
        "the logical outcome is not an alternate array-construction chooser");
      return true;
    });
    assert.equal(observed.value, true, "the normal Source session reaches the stage assertions");
  });
}
