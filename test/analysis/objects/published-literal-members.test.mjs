import assert from "node:assert/strict";
import test from "node:test";
import { sourceTypeDescriptorMemberOriginsEqual } from "@tsonic/target-api/source";
import { compileCsharpSource, compileCsharpAnalysisTarget, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { nativeAbsenceSource } from "../../../../tsonic/test/fixtures/native-absence.mjs";

function originalLiteral(source) {
  const ast = source.ast;
  const declaration = source.navigation.nodes.find(node => ast.is.IsVariableDeclaration(node) && ast.text(ast.name(node)) === "shape");
  const literal = declaration === undefined ? undefined : ast.as.AsVariableDeclaration(declaration)?.Initializer;
  assert.equal(literal !== undefined && ast.is.IsObjectLiteralExpression(literal), true, "the actual original allocation is retained");
  return literal;
}

for (const surface of ["native", "js"]) {
  test(`${surface} a proven literal retains its actual property and canonical destination origin`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: nativeAbsenceSource });
    assertCsharpCompilationSucceeded(compiled);
    const { source, records } = compiled.result.program;
    const literal = originalLiteral(source);
    const property = source.ast.properties(literal)[0];
    const outcome = source.effectiveTypes.get(literal);
    const pair = outcome?.kind === "refused" ? undefined : outcome?.memberCorrespondence?.find(entry => entry.property === property);
    const shape = compiled.result.program.objectShapes.resolveNode(literal);
    assert.equal(pair !== undefined && shape?.members.length === 1 &&
      shape.members[0].sourceSubjects?.includes(property) === true &&
      shape.members[0].origins?.some(origin => sourceTypeDescriptorMemberOriginsEqual(origin, pair.origin)) === true, true,
    "the final Native inventory retains both exact compiler identities, not only the destination signature");
    const read = source.navigation.nodes.find(node => source.ast.is.IsPropertyAccessExpression(node) &&
      source.ast.is.IsIdentifier(source.ast.as.AsPropertyAccessExpression(node)?.Expression) &&
      source.ast.text(source.ast.as.AsPropertyAccessExpression(node)?.Expression) === "shape" &&
      source.ast.text(source.ast.name(node)) === "value");
    assert.equal(read !== undefined && records.selectedProperty.get(read)?.selection.source?.selectedDeclaration === property, true,
      "the actual selected property resolves through that retained inventory");
  });

  for (const mode of ["foreign-property", "foreign-origin"]) {
    test(`${surface} ${mode} correspondence cannot supply a literal member`, () => {
      let consumed = 0;
      const compiled = compileCsharpSource({ surface, sourceText: nativeAbsenceSource,
        compileTarget(request, observer) {
          const source = request.input.source;
          const literal = originalLiteral(source);
          const actual = source.effectiveTypes.get(literal);
          assert.equal(actual?.kind !== "refused" && actual?.memberCorrespondence?.length === 1, true,
            "the unmodified original has its exact complete correspondence");
          const foreign = source.navigation.nodes.find(node => source.ast.is.IsPropertyAssignment(node) && source.ast.parent(node) !== literal);
          assert.equal(foreign !== undefined, true, "a different original declaration exists in the same compilation");
          const pair = actual.memberCorrespondence[0];
          const memberCorrespondence = [mode === "foreign-property" ? { ...pair, property: foreign }
            : { ...pair, origin: { kind: "declared", declaration: foreign } }];
          const effectiveTypes = { ...source.effectiveTypes, get(node) {
            if (node !== literal) return source.effectiveTypes.get(node);
            consumed += 1;
            return { ...actual, memberCorrespondence };
          } };
          return compileCsharpAnalysisTarget({ ...request, input: { ...request.input,
            source: { ...source, effectiveTypes } } }, observer);
        },
      });
      assert.equal(compiled.sourceDiagnosticsText, "", "the original program remains checked and unchanged");
      assert.equal(consumed > 0 && compiled.targetDiagnostics.length > 0 && compiled.result.program === undefined &&
        compiled.artifacts.size === 0, true, "foreign identities never become a same-name or same-shape member fallback");
    });
  }
}
