import assert from "node:assert/strict";
import { compileEffectiveSource } from "./source-effective-types.mjs";

export function assertUnfilledEmptyObject(surface, sourceText, expectedConstructions) {
  assert.equal(Number.isInteger(expectedConstructions) && expectedConstructions > 0, true,
    "the original program declares its exact number of unfilled constructions");
  const compiled = compileEffectiveSource(surface, sourceText);
  const issues = compiled.result.diagnostics.filter(issue => issue.category === "error");
  assert.equal(issues.length, expectedConstructions, "one canonical Host refusal per original unfilled construction");
  const refusals = compiled.targetSource.effectiveTypes.refusals();
  assert.equal(refusals.length, expectedConstructions, "the complete published refusal list has no extra or missing site");
  const sites = new Set();
  const ast = compiled.targetSource.ast;
  for (const issue of issues) {
    assert.equal(issue.code, "TSONIC_UNTYPED_OBJECT_LITERAL", "the exact approved refusal class is preserved");
    assert.equal(issue.source, "tsonic", "language refusal belongs to the Host");
    assert.equal(issue.message, "This object literal has no target type. Declare one, e.g. 'function baseOptions(): MakeDirectoryOptions'.");
    const matching = refusals.filter(refusal => refusal.code === issue.code && refusal.site === issue.sourceNode);
    assert.equal(matching.length, 1, "each diagnostic retains its identical published Host refusal and original occurrence");
    assert.equal(issue.message, matching[0].reason, "the target forwards the actual Host reason unchanged");
    assert.equal(issue.sourceNode !== undefined && ast.is.IsObjectLiteralExpression(issue.sourceNode), true,
      "the refusal belongs to the actual object construction");
    const range = ast.authoredRange(issue.sourceNode);
    const actual = range?.kind === "authored"
      ? ast.getSourceText(ast.getSourceFile(issue.sourceNode)).slice(range.start, range.end) : undefined;
    assert.equal(actual, "{}", "the precise original failing literal is retained");
    sites.add(issue.sourceNode);
  }
  assert.equal(sites.size, expectedConstructions, "distinct construction groups never duplicate or replace each other");
  assert.equal(compiled.result.program === undefined && compiled.artifacts.size === 0, true,
    "a refused source publishes no target program or artifacts");
  return compiled;
}

export function annotatedEmptyValues(sourceText) {
  let annotations = 0;
  let selected = sourceText.replace(/const (direct|empty) = \{\};/gu, (_match, name) => {
    annotations += 1;
    return `const ${name}: ExplicitEmptyValue = {};`;
  });
  selected = selected.replace(/retain\(\{\}\)/gu, () => {
    annotations += 1;
    return "retain({} as ExplicitEmptyValue)";
  });
  selected = selected.replace(/(same|different)\(empty, \{\}\)/gu, (_match, operation) => {
    annotations += 1;
    return `${operation}(empty, {} as ExplicitEmptyValue)`;
  });
  if (annotations === 0) return sourceText;
  assert.equal(sourceText.includes("ExplicitEmptyValue"), false, "the companion introduces no conflicting authored declaration");
  return `class ExplicitEmptyValue {}\n${selected}`;
}
