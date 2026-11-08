import assert from "node:assert/strict";
import { compileCsharpSource, assertCsharpCompilationSucceeded, assertCsharpCheckingSucceeded } from "./direct-csharp-session.mjs";
import { resolvedSourceValue } from "./published-return-contracts.mjs";

export function compileEffectiveSource(surface, sourceText, options = {}) {
  const compiled = compileCsharpSource({ ...options, surface, sourceText });
  assertCsharpCheckingSucceeded(compiled);
  const source = compiled.source;
  assert.equal(source.facts?.values !== undefined && source.facts.descriptors !== undefined, true,
    "one complete Host evidence view is published before target entry");
  return { ...compiled, sourceOccurrences: createSourceOccurrenceIndex(source) };
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
  assert.equal(compiled.sourceOccurrences?.source === compiled.source, true,
    "one occurrence inventory belongs to the identical original Source view");
  const file = projectFile(compiled);
  return compiled.sourceOccurrences.get(file, name);
}

function projectFile(compiled) {
  const source = compiled.source;
  const path = `${compiled.paths.projectRoot}/index.ts`;
  const files = source.sourceFiles.filter(file => source.ast.getPath(file) === path);
  assert.equal(files.length, 1, "the normal Source program retains the one original project entry");
  return files[0];
}

export function acceptedEffectiveSource(compiled) {
  assertCsharpCompilationSucceeded(compiled);
  assert.equal(compiled.result.program !== undefined, true, "the real target publishes its analysis program");
  return [...compiled.artifacts.values()].join("\n");
}

export function projectNodes(compiled, predicate) {
  const ast = compiled.source.ast;
  const file = projectFile(compiled);
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
    const outcome = compiled.source.facts.values.type(node);
    const evidence = resolvedSourceValue(outcome, `${name}: original occurrence`);
    compiled.source.facts.descriptors.assertEvidence(evidence);
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
    const evidence = resolvedSourceValue(compiled.source.facts.values.type(node), `${name}: original array occurrence`);
    compiled.source.facts.descriptors.assertEvidence(evidence);
    assert.equal(evidence.type.kind === "array" && evidence.type.element.kind === "primitive" &&
      evidence.type.element.primitive === primitive, true, `${name}: the exact ${primitive} element survives`);
    published += 1;
  }
  assert.equal(published >= minimum, true, `${name}: at least ${minimum} actual arrays are published`);
}

export function assertPublishedRefusal(compiled, code, siteText) {
  const issues = compiled.result.diagnostics.filter(issue => issue.category === "error");
  const ast = compiled.source.ast;
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
  const refusal = compiled.source.facts.values.type(issue.sourceNode);
  assert.equal(refusal.kind, "refused", "the exact original occurrence returns the actual Source refusal");
  assert.equal(compiled.source.facts.refusals().includes(refusal), true, "the identical lazy or eager refusal belongs to the canonical inventory");
  assert.equal(refusal.code === code && refusal.site === issue.sourceNode, true,
    "the Native diagnostic belongs to that same original Source outcome");
  assert.equal(issue.message, refusal.message, "the target forwards the actual Host message without inventing another message");
  const range = issue.sourceNode === undefined ? undefined : ast.authoredRange(issue.sourceNode);
  const actual = range?.kind === "authored" ? ast.getSourceText(ast.getSourceFile(issue.sourceNode)).slice(range.start, range.end) : undefined;
  assert.equal(actual, siteText, "the precise original failing use or literal is retained");
  assert.equal(compiled.result.program === undefined && compiled.artifacts.size === 0, true, "a refused source publishes no target program or artifacts");
}

export function assertPublishedSourceFormRefusal(compiled, issue, message, siteText) {
  const source = compiled.source;
  assert.equal(source !== undefined && issue.sourceNode !== undefined, true, "the original Source view and exact form are required");
  const refusal = source.facts.admission.form(issue.sourceNode);
  assert.equal(refusal.kind, "refused", "the nonvalue form query returns its actual Source refusal");
  assert.equal(refusal.code, "TSONIC_SOURCE_FORM_UNSUPPORTED");
  assert.equal(refusal.source, "tsonic");
  assert.equal(refusal.site === issue.sourceNode, true, "form refusal retains the original exact syntax identity");
  assert.equal(refusal.message, message, "the exact form-specific Host message is independent of the Native forwarder");
  assert.equal(source.facts.refusals().includes(refusal), true, "the SAME admission outcome belongs to the canonical refusal inventory");
  assert.equal(source.facts.admission.form(issue.sourceNode) === refusal, true, "the original form has one canonical per-view outcome");
  assert.equal(issue.code === refusal.code && issue.source === refusal.source && issue.message === refusal.message &&
    issue.sourceNode === refusal.site, true, "Native forwards every original Host refusal field unchanged");
  const range = source.ast.authoredRange(refusal.site);
  assert.equal(range.kind, "authored", "the Source form refusal is on its original authored site");
  const actual = source.ast.getSourceText(source.ast.getSourceFile(refusal.site)).slice(range.start, range.end);
  assert.equal(actual, siteText, "the exact original form is not replaced by a binder or parent");
  assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined && compiled.artifacts.size === 0, true,
    "the Source form refusal publishes no Native program, plan or artifacts");
  return refusal;
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

export function assertNativeEffectiveRefusal(compiled, code, message, siteText) {
  const issues = compiled.result.diagnostics.filter(issue => issue.category === "error");
  assert.equal(issues.length, 1, "one exact native obligation refusal stops publication");
  const issue = issues[0];
  assert.equal(issue.code, code, "the owning fixture supplies its exact Native refusal code");
  assert.equal(issue.source, "tsonic-csharp");
  assert.equal(issue.message, message);
  const ast = compiled.source.ast;
  const range = issue.sourceNode === undefined ? undefined : ast.authoredRange(issue.sourceNode);
  const actual = range?.kind === "authored" ? ast.getSourceText(ast.getSourceFile(issue.sourceNode)).slice(range.start, range.end) : undefined;
  assert.equal(actual, siteText, "native admission retains the exact chosen source occurrence");
  assert.equal(compiled.result.program === undefined && compiled.result.plan === undefined && compiled.artifacts.size === 0, true,
    "native rejection publishes no program, plan or artifact");
}
