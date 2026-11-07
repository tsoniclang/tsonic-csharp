import assert from "node:assert/strict";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "./direct-csharp-session.mjs";
import { analyzeCsharpDeclarations } from "../../dist/analysis/declarations/analyze.js";

export function publishedReturnContracts(sourceText) {
  const compiled = compileCsharpSource({ sourceText });
  assertCsharpCompilationSucceeded(compiled);
  const source = compiled.result.program.source;
  const files = source.sourceFiles.filter(file => !source.ast.isDeclarationFile(file));
  const result = new Map();
  for (const file of files) for (const declaration of source.ast.statements(file)) {
    if (!source.ast.is.IsFunctionDeclaration(declaration)) continue;
    const publication = source.effectiveTypes.callableReturn(declaration);
    const contract = compiled.result.program.records.returnContract.get(declaration);
    assert.equal(publication !== undefined && publication.kind !== "refused" &&
      publication.provenance.occurrence === declaration && contract?.kind === "resolved", true,
      "the actual Source callable and its Native return have complete current publications");
    result.set(source.ast.text(source.ast.name(declaration)), { publication, contract, declaration, source, files });
  }
  return result;
}

export function unrepresentedReturnContract(input) {
  const records = analyzeCsharpDeclarations({ ast: input.source.ast, sourceFiles: input.files,
    types: { resolveCallableReturn: () => undefined } },
  { compileTimeMetadata: new Map(), pointerReturn: new Map(), nodeTargetType: new Map() },
  { selectedProperty: new Map() });
  return records.returnContract.get(input.declaration);
}
