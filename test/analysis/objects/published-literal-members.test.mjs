import assert from "node:assert/strict";
import test from "node:test";
import { sourceTypeDescriptorMemberOriginsEqual } from "@tsonic/target-api/source";
import { compileCsharpSource, compileCsharpAnalysisTarget, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { nativeAbsenceSource } from "../../../../tsonic/test/fixtures/native-absence.mjs";

// The Source facts program's nodes, in Host program order (nextgen C-2542: navigation.nodes is a C# syntax walk).
const sourceNodes = source => source.facts.navigation.nodesForFiles(source.sourceFiles);

function originalLiteral(source) {
  const ast = source.syntax;
  const declaration = sourceNodes(source).find(node => ast.is.IsVariableDeclaration(node) && ast.text(ast.name(node)) === "shape");
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
    const property = source.syntax.properties(literal)[0];
    const outcome = source.facts.values.type(literal);
    const pair = outcome?.kind === "refused" ? undefined : outcome?.memberCorrespondence?.find(entry => entry.property === property);
    const shape = compiled.result.program.objectShapes.resolveNode(literal);
    assert.equal(pair !== undefined && shape?.members.length === 1 &&
      shape.members[0].sourceSubjects?.includes(property) === true &&
      shape.members[0].origins?.some(origin => sourceTypeDescriptorMemberOriginsEqual(origin, pair.origin)) === true, true,
    "the final Native inventory retains both exact compiler identities, not only the destination signature");
    const ast = source.syntax;
    const read = sourceNodes(source).find(node => ast.is.IsPropertyAccessExpression(node) &&
      ast.is.IsIdentifier(ast.as.AsPropertyAccessExpression(node)?.Expression) &&
      ast.text(ast.as.AsPropertyAccessExpression(node)?.Expression) === "shape" &&
      ast.text(ast.name(node)) === "value");
    // The selection's Source half is the published SourceMemberAccessSelection (nextgen C-2542).
    const selected = read === undefined ? undefined : records.selectedProperty.get(read)?.selection.source?.selected;
    assert.equal(selected?.kind === "member" && selected.declarations.length === 1 && selected.declarations[0] === property, true,
      "the actual selected property resolves through that retained inventory");
  });

  for (const mode of ["foreign-property", "foreign-origin"]) {
    test(`${surface} ${mode} correspondence cannot supply a literal member`, () => {
      let consumed = 0;
      const compiled = compileCsharpSource({ surface, sourceText: nativeAbsenceSource,
        compileTarget(request, observer) {
          const source = request.input.source;
          const literal = originalLiteral(source);
          const actual = source.facts.values.type(literal);
          assert.equal(actual?.kind !== "refused" && actual?.memberCorrespondence?.length === 1, true,
            "the unmodified original has its exact complete correspondence");
          const foreign = sourceNodes(source).find(node => source.syntax.is.IsPropertyAssignment(node) && source.syntax.parent(node) !== literal);
          assert.equal(foreign !== undefined, true, "a different original declaration exists in the same compilation");
          const pair = actual.memberCorrespondence[0];
          const memberCorrespondence = [mode === "foreign-property" ? { ...pair, property: foreign }
            : { ...pair, origin: { kind: "declared", declaration: foreign } }];
          // The literal's published value outcome (facts.values.type) carries the tampered correspondence.
          const values = { ...source.facts.values, type(node) {
            if (node !== literal) return source.facts.values.type(node);
            consumed += 1;
            return { ...actual, memberCorrespondence };
          } };
          return compileCsharpAnalysisTarget({ ...request, input: { ...request.input,
            source: { ...source, facts: { ...source.facts, values } } } }, observer);
        },
      });
      assert.equal(compiled.sourceDiagnosticsText, "", "the original program remains checked and unchanged");
      assert.equal(consumed > 0 && compiled.targetDiagnostics.length > 0 && compiled.result.program === undefined &&
        compiled.artifacts.size === 0, true, "foreign identities never become a same-name or same-shape member fallback");
    });
  }
}
