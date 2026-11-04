import assert from "node:assert/strict";
import { compileCsharpAnalysisTarget, compileCsharpSource, assertCsharpCompilationSucceeded, assertCsharpCheckingSucceeded } from "./direct-csharp-session.mjs";

export function compileEffectiveSource(surface, sourceText, options = {}) {
  let targetSource;
  const compiled = compileCsharpSource({ ...options, surface, sourceText,
    compileTarget(request, observer) {
      targetSource = request.input.source;
      return compileCsharpAnalysisTarget(request, observer);
    },
  });
  assertCsharpCheckingSucceeded(compiled);
  assert.equal(targetSource !== undefined, true, "the actual checked program reaches the target");
  assert.equal(targetSource.effectiveTypes !== undefined, true, "Host effective types are published before target entry");
  return { ...compiled, targetSource };
}

export function acceptedEffectiveSource(compiled) {
  assertCsharpCompilationSucceeded(compiled);
  assert.equal(compiled.result.program !== undefined, true, "the real target publishes its analysis program");
  return [...compiled.artifacts.values()].join("\n");
}

export function projectNodes(compiled, predicate) {
  const ast = compiled.targetSource.ast;
  const file = compiled.source.getSourceFile("/project/index.ts");
  assert.equal(file !== undefined, true, "the original project source exists");
  const selected = [];
  const visit = node => {
    if (predicate(node, ast)) selected.push(node);
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  visit(file);
  return selected;
}

export function assertPrimitiveOccurrences(compiled, name, primitive, minimum = 1) {
  const nodes = projectNodes(compiled, (node, ast) => ast.is.IsIdentifier(node) && ast.text(node) === name);
  let published = 0;
  for (const node of nodes) {
    const outcome = compiled.targetSource.effectiveTypes.get(node);
    if (outcome === undefined) continue;
    assert.equal(outcome.kind === "resolved" || outcome.kind === "default", true, `${name}: the chosen occurrence is available`);
    assert.equal(outcome.type.kind === "primitive" && outcome.type.primitive === primitive, true, `${name}: one exact ${primitive} descriptor`);
    const native = compiled.result.program.records.valueRead.get(node)?.value;
    if (native !== undefined) assert.equal(native.kind === "source-primitive" && native.name === primitive, true,
      `${name}: node-keyed C# value agrees with the Host descriptor`);
    published += 1;
  }
  assert.equal(published >= minimum, true, `${name}: at least ${minimum} actual occurrences are in the publication domain`);
}

export function assertArrayOccurrences(compiled, name, primitive, minimum = 1) {
  const nodes = projectNodes(compiled, (node, ast) => ast.is.IsIdentifier(node) && ast.text(node) === name);
  let published = 0;
  for (const node of nodes) {
    const outcome = compiled.targetSource.effectiveTypes.get(node);
    if (outcome === undefined) continue;
    assert.equal(outcome.kind === "resolved" || outcome.kind === "default", true, `${name}: the chosen array occurrence is available`);
    assert.equal(outcome.type.kind === "array" && outcome.type.element.kind === "primitive" &&
      outcome.type.element.primitive === primitive, true, `${name}: the exact ${primitive} element survives`);
    published += 1;
  }
  assert.equal(published >= minimum, true, `${name}: at least ${minimum} actual arrays are published`);
}

export function assertPublishedRefusal(compiled, code, siteText) {
  const issues = compiled.result.diagnostics.filter(issue => issue.category === "error");
  assert.equal(issues.length, 1, "one canonical Host refusal stops publication");
  const issue = issues[0];
  assert.equal(issue.code, code, "the exact approved refusal class is preserved");
  assert.equal(issue.source, "tsonic", "language refusal belongs to the Host");
  const matching = compiled.targetSource.effectiveTypes.refusals().filter(refusal => refusal.code === code && refusal.site === issue.sourceNode);
  assert.equal(matching.length, 1, "the diagnostic retains the identical published Host refusal and source occurrence");
  assert.equal(issue.message, matching[0].reason, "the target forwards the actual Host reason without inventing another message");
  const ast = compiled.targetSource.ast;
  const range = issue.sourceNode === undefined ? undefined : ast.authoredRange(issue.sourceNode);
  const actual = range?.kind === "authored" ? ast.getSourceText(ast.getSourceFile(issue.sourceNode)).slice(range.start, range.end) : undefined;
  assert.equal(actual, siteText, "the precise original failing use or literal is retained");
  assert.equal(compiled.result.program === undefined && compiled.artifacts.size === 0, true, "a refused source publishes no target program or artifacts");
}

export function assertNativeEffectiveRefusal(compiled, message, siteText) {
  const issues = compiled.result.diagnostics.filter(issue => issue.category === "error");
  assert.equal(issues.length, 1, "one exact native obligation refusal stops publication");
  const issue = issues[0];
  assert.equal(issue.code, "CSHARP_UNSUPPORTED_AST");
  assert.equal(issue.source, "tsonic-csharp");
  assert.equal(issue.message, message);
  const ast = compiled.targetSource.ast;
  const range = issue.sourceNode === undefined ? undefined : ast.authoredRange(issue.sourceNode);
  const actual = range?.kind === "authored" ? ast.getSourceText(ast.getSourceFile(issue.sourceNode)).slice(range.start, range.end) : undefined;
  assert.equal(actual, siteText, "native admission retains the exact chosen source occurrence");
  assert.equal(compiled.result.program === undefined && compiled.artifacts.size === 0, true, "native rejection publishes no program or artifact");
}
