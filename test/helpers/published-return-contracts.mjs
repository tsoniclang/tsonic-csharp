import assert from "node:assert/strict";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "./direct-csharp-session.mjs";
import { analyzeCsharpDeclarations } from "../../dist/analysis/declarations/analyze.js";

export function publishedReturnContracts(sourceText) {
  const compiled = compileCsharpSource({ sourceText });
  assertCsharpCompilationSucceeded(compiled);
  const source = compiled.result.program.source;
  const files = source.sourceFiles.filter(file => !source.syntax.isDeclarationFile(file));
  const result = new Map();
  for (const file of files) for (const declaration of source.syntax.statements(file)) {
    if (!source.syntax.is.IsFunctionDeclaration(declaration)) continue;
    const publication = source.facts.values.callableReturn(declaration);
    const contract = compiled.result.program.records.returnContract.get(declaration);
    assert.equal(publication !== undefined && publication.kind !== "refused" &&
      publication.provenance.occurrence === declaration && contract?.kind === "resolved", true,
      "the actual Source callable and its Native return have complete current publications");
    result.set(source.syntax.text(source.syntax.name(declaration)), { publication, contract, declaration, source, files });
  }
  return result;
}

export function unrepresentedReturnContract(input) {
  // A return the C# representation refuses: the CsharpTypeQueries answer is a CSHARP_ refusal (nextgen C-2542).
  const records = analyzeCsharpDeclarations({ ast: input.source.syntax, sourceFiles: input.files, facts: input.source.facts,
    types: { callableReturn: declaration => Object.freeze({ kind: "csharp-refused", code: "CSHARP_RETURN_UNREPRESENTED",
      message: "The published return has no C# representation in this test double.", site: declaration }) } },
  { compileTimeMetadata: new Map(), pointerReturn: new Map(), nodeTargetType: new Map() },
  { selectedProperty: new Map() });
  return records.returnContract.get(input.declaration);
}
