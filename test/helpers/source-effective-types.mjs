import assert from "node:assert/strict";
import { compileCsharpAnalysisTarget, compileCsharpSource, assertCsharpCompilationSucceeded, assertCsharpCheckingSucceeded } from "./direct-csharp-session.mjs";
import { resolvedSourceValue } from "./published-return-contracts.mjs";

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
  assert.equal(targetSource.facts?.values !== undefined && targetSource.facts.descriptors !== undefined, true,
    "one complete Host evidence view is published before target entry");
  return { ...compiled, targetSource, sourceOccurrences: createSourceOccurrenceIndex(targetSource) };
}

export function createSourceOccurrenceIndex(source) {
  const files = new Map();
  const occurrences = source.facts.values.occurrences();
  assert.equal(new Set(occurrences).size, occurrences.length, "the complete original value inventory contains no duplicate occurrence");
  for (const occurrence of occurrences) {
    if (!source.ast.is.IsIdentifier(occurrence)) continue;
    const file = source.ast.getSourceFile(occurrence);
    const name = source.ast.text(occurrence);
    let names = files.get(file);
    if (names === undefined) {
      names = new Map();
      files.set(file, names);
    }
    const previous = names.get(name) ?? [];
    previous.push(occurrence);
    names.set(name, previous);
  }
  for (const names of files.values()) for (const nodes of names.values()) Object.freeze(nodes);
  return Object.freeze({ source, get(file, name) { return files.get(file)?.get(name) ?? []; } });
}

function namedValueOccurrences(compiled, name) {
  assert.equal(compiled.sourceOccurrences?.source === compiled.targetSource, true,
    "one occurrence inventory belongs to the identical original Source view");
  const file = compiled.source.getSourceFile("/project/index.ts");
  assert.equal(file !== undefined, true, "the original project source exists");
  return compiled.sourceOccurrences.get(file, name);
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
  const nodes = namedValueOccurrences(compiled, name);
  let published = 0;
  for (const node of nodes) {
    const outcome = compiled.targetSource.facts.values.type(node);
    const evidence = resolvedSourceValue(outcome, `${name}: original occurrence`);
    compiled.targetSource.facts.descriptors.assertEvidence(evidence);
    assert.equal(evidence.type.kind === "primitive" && evidence.type.primitive === primitive, true, `${name}: one exact ${primitive} descriptor`);
    const native = compiled.result.program.records.valueRead.get(node)?.value;
    if (native !== undefined) assert.equal(native.kind === "source-primitive" && native.name === primitive, true,
      `${name}: node-keyed C# value agrees with the Host descriptor`);
    published += 1;
  }
  assert.equal(published >= minimum, true, `${name}: at least ${minimum} actual occurrences are in the publication domain`);
}

export function assertArrayOccurrences(compiled, name, primitive, minimum = 1) {
  const nodes = namedValueOccurrences(compiled, name);
  let published = 0;
  for (const node of nodes) {
    const evidence = resolvedSourceValue(compiled.targetSource.facts.values.type(node), `${name}: original array occurrence`);
    compiled.targetSource.facts.descriptors.assertEvidence(evidence);
    assert.equal(evidence.type.kind === "array" && evidence.type.element.kind === "primitive" &&
      evidence.type.element.primitive === primitive, true, `${name}: the exact ${primitive} element survives`);
    published += 1;
  }
  assert.equal(published >= minimum, true, `${name}: at least ${minimum} actual arrays are published`);
}

export function assertPublishedRefusal(compiled, code, siteText) {
  const issues = compiled.result.diagnostics.filter(issue => issue.category === "error");
  const ast = compiled.targetSource.ast;
  const label = issues.map(issue => {
    const range = issue.sourceNode === undefined ? undefined : ast.authoredRange(issue.sourceNode);
    const text = range?.kind !== "authored" ? "<unavailable>"
      : ast.getSourceText(ast.getSourceFile(issue.sourceNode)).slice(range.start, range.end).slice(0, 200);
    return `${issue.code}: ${issue.message} at ${text}`;
  }).join("; ");
  assert.equal(issues.length, 1, `one canonical Host refusal stops publication; ${label}`);
  const issue = issues[0];
  assert.equal(issue.code, code, "the exact approved refusal class is preserved");
  assert.equal(issue.source, "tsonic", "language refusal belongs to the Host");
  const refusal = compiled.targetSource.facts.values.type(issue.sourceNode);
  assert.equal(refusal.kind, "refused", "the exact original occurrence returns the actual Source refusal");
  assert.equal(compiled.targetSource.facts.refusals().includes(refusal), true, "the identical lazy or eager refusal belongs to the canonical inventory");
  assert.equal(refusal.code === code && refusal.site === issue.sourceNode, true,
    "the Native diagnostic belongs to that same original Source outcome");
  assert.equal(issue.message, refusal.message, "the target forwards the actual Host message without inventing another message");
  const range = issue.sourceNode === undefined ? undefined : ast.authoredRange(issue.sourceNode);
  const actual = range?.kind === "authored" ? ast.getSourceText(ast.getSourceFile(issue.sourceNode)).slice(range.start, range.end) : undefined;
  assert.equal(actual, siteText, "the precise original failing use or literal is retained");
  assert.equal(compiled.result.program === undefined && compiled.artifacts.size === 0, true, "a refused source publishes no target program or artifacts");
}

export function assertPublishedMixedConstructionRefusals(compiled) {
  assert.equal(compiled.sourceDiagnosticsText, "", "the original mixed programs remain valid checked Source");
  const source = compiled.nativeStage.source;
  const issues = compiled.result.diagnostics.filter(issue => issue.category === "error");
  assert.equal(issues.length > 0, true, "the original open mixed constructions are refused");
  const sites = new Set();
  for (const issue of issues) {
    assert.equal(issue.code, "TSONIC_LOCAL_TYPE_MIXED_ELEMENTS", "no other Source or Native failure is accepted as C19");
    assert.equal(issue.source, "tsonic", "the canonical mixed-element refusal is Host-owned");
    assert.equal(issue.message, "This array literal mixes different fixed source types. Annotate the array and convert its elements explicitly.");
    assert.equal(source.ast.is.IsArrayLiteralExpression(issue.sourceNode), true, "the refusal retains the actual construction");
    const refusal = source.facts.values.type(issue.sourceNode);
    assert.equal(refusal.kind === "refused" && refusal.code === issue.code && refusal.site === issue.sourceNode &&
      refusal.message === issue.message, true, "the exact actual construction returns this Source refusal");
    assert.equal(source.facts.refusals().includes(refusal), true, "the canonical inventory retains that same original refusal object");
    sites.add(issue.sourceNode);
  }
  assert.equal(sites.size, issues.length, "each refused construction is a distinct checked occurrence");
  assert.equal(compiled.result.program === undefined && compiled.artifacts.size === 0, true, "no refused construction reaches publication");
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
