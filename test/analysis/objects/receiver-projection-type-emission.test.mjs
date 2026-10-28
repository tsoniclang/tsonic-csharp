import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { getCsharpNullableElementTargetType, targetTypeRefEquals } from "../../../dist/target-model/types/index.js";
import { recursiveOptionalCollectionUnionFiles, recursiveOptionalCollectionUnionJsFiles } from "../../../../tsonic/test/fixtures/recursive-source-unions.mjs";

for (const surface of [undefined, "js"]) {
  test(`optional recursive member projections publish native receiver types before sealing on ${surface ?? "native"}`, () => {
    const files = surface === undefined ? recursiveOptionalCollectionUnionFiles : recursiveOptionalCollectionUnionJsFiles;
    const checked = analyzeCsharpSource({ surface, sourceText: files["index.ts"], files: { "tree.ts": files["tree.ts"] } });
    assert.equal(checked.sourceDiagnosticsText, "", "the unchanged recursive fixture is valid checked source");
    assert.equal(checked.analysis.kind, "resolved", "the native analysis admits the recursive collection members");
    const program = checked.analysis.value;
    let elementProjections = 0;
    let propertyProjections = 0;
    const visit = node => {
      const element = program.records.selectedElement.get(node);
      const property = program.records.selectedProperty.get(node);
      const projection = element?.receiverProjection ?? property?.receiverProjection;
      if (projection !== undefined) {
        if (element !== undefined) elementProjections++;
        if (property !== undefined) propertyProjections++;
        assert.equal(projection.conversion.kind, "runtime-union-projection", "the receiver uses its admitted native union projection");
        assert.equal(program.records.typeEmission.get(projection.source) !== undefined, true,
          "the physical source receiver owns a sealed type-emission plan");
        const target = program.records.typeEmission.get(projection.target);
        assert.equal(target !== undefined, true, "the projected native receiver owns its sealed type-emission plan");
        const present = getCsharpNullableElementTargetType(projection.target);
        assert.equal(present !== undefined, true, "the selected optional receiver retains the native absence state");
        assert.equal(targetTypeRefEquals(target.optionalStorage.present, present), true,
          "the optional receiver plan retains the exact native present carrier");
        assert.equal(target.optionalStorage.kind, "native", "the receiver uses native absence storage without a new wrapper");
      }
      program.source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
    };
    for (const file of program.source.sourceFiles) visit(file);
    assert.equal(elementProjections, 3, "all three element projections include direct and effectful receivers");
    assert.equal(propertyProjections, surface === "js" ? 1 : 0, "the JS length property uses the same type-emission closure");
  });
}
