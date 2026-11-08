import assert from "node:assert/strict";
import { assertCsharpCompilationSucceeded, compileCsharpAnalysisTarget, compileCsharpSource } from "./direct-csharp-session.mjs";

export function resolvedSourceValue(outcome, label) {
  assert.equal(outcome !== undefined, true, `${label}: an actual Source outcome is required`);
  assert.equal(outcome.kind, "resolved", `${label}: ${outcome.code ?? ""} ${outcome.message ?? ""}`.slice(0, 1400));
  return outcome.value;
}

export function publishedCallableReturn(source, declaration) {
  const view = source.facts.descriptors;
  const callable = resolvedSourceValue(source.facts.values.type(declaration), "original callable");
  view.assertEvidence(callable);
  const definition = callable.type.kind === "declared"
    ? resolvedSourceValue(view.definition(callable), "original callable definition") : callable;
  assert.equal(definition.type.kind === "callable" || definition.type.kind === "shape", true,
    "the original callable has a genuine signature inventory");
  const signatures = definition.type.calls.filter(signature => signature.identity.declaration === declaration);
  assert.equal(signatures.length, 1, "one exact original authored callable signature");
  const signature = signatures[0].identity;
  const publication = resolvedSourceValue(source.facts.values.callableReturn(signature), "original callable return");
  view.assertEvidence(publication);
  return { signature, publication };
}

export function publishedReturnContracts(sourceText) {
  let source;
  const compiled = compileCsharpSource({ sourceText, compileTarget(request, observer) {
    source = request.input.source;
    return compileCsharpAnalysisTarget(request, observer);
  } });
  assertCsharpCompilationSucceeded(compiled);
  assert.equal(source !== undefined, true, "the complete original Source program reaches analysis");
  const files = source.sourceFiles.filter(file => !source.ast.isDeclarationFile(file));
  const result = new Map();
  for (const file of files) for (const declaration of source.ast.statements(file)) {
    if (!source.ast.is.IsFunctionDeclaration(declaration)) continue;
    const { signature, publication } = publishedCallableReturn(source, declaration);
    const contract = compiled.result.program.records.returnContract.get(declaration);
    assert.equal(contract?.kind === "resolved", true,
      "the actual Source callable and its Native return have complete current publications");
    result.set(source.ast.text(source.ast.name(declaration)), { signature, publication, contract, declaration, source, files });
  }
  return result;
}
