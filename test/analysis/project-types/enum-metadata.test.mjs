import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCsharpSource, compileCsharpAnalysisTarget, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { createCsharpProjectTypeCatalog } from "../../../dist/analysis/project-types/catalog.js";

// The catalog host is `{ ast, facts, sourceFiles }` over the Source facts program the C# session built (nextgen
// C-2542: createTargetSourceProgram needs the composition's profile; enum constants come from facts.values.literal).
function fixture(text) {
  const checked = analyzeCsharpSource({ sourceText: text });
  assert.equal(checked.sourceDiagnosticsText, "", "the enum declarations are checked source");
  const { source } = checked;
  return { source, host: { ast: source.syntax, facts: source.facts, sourceFiles: source.sourceFiles, sourceFacts: source.sourceFacts } };
}

function enumMembers(source) {
  const members = [];
  const visit = node => {
    if (source.syntax.is.IsEnumMember(node)) members.push(node);
    source.syntax.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  source.sourceFiles.filter(file => source.syntax.getFileName(file) === "/project/index.ts").forEach(visit);
  return members;
}

test("the early C# project catalog publishes the one common exact enum width", () => {
  const { source, host } = fixture(`
export enum Empty {}
export enum Small { Low = -2147483648, High = 2147483647 }
export enum Wide { Exact = 9007199254740993, Next = 9007199254740994, Same = 9007199254740993 }
export enum Bounds { Low = -9223372036854775808, High = 9223372036854775807 }
export class Ordinary {}
`);
  const catalog = createCsharpProjectTypeCatalog(host);
  assert.equal(catalog.issues.length, 0, "all admitted exact native enum values have an early definition");
  const widths = new Map(catalog.definitions.map(definition => [definition.sourceName,
    definition.kind === "enum" ? definition.integerWidth : undefined]));
  assert.deepEqual([...widths.entries()].sort(), [["Bounds", 64], ["Empty", 32], ["Ordinary", undefined], ["Small", 32], ["Wide", 64]]);
  // nextgen C-2542: the old per-declaration read count of semantics.enumConstants.integerWidth is removed. The width is
  // C#'s choice over the published member constants (facts.values.literal); no shared Host width decision exists to count.
  for (const definition of catalog.definitions) {
    assert.equal(Object.isFrozen(definition), true, `${definition.sourceName} is sealed metadata`);
    assert.equal(catalog.definitionContainingDeclaration(definition.declaration) === definition, true,
      `${definition.sourceName} has one stored definition identity`);
  }
  const values = enumMembers(source).map(member => source.facts.values.literal(member)?.integer).filter(value => value !== undefined);
  assert.equal(values.includes(9007199254740993n) && values.includes(9007199254740994n), true, "exact discriminants never pass through Number");
});

test("C# enum rejections forward the common Host refusal before type publication", () => {
  // nextgen C-2542 (R-F5-A3): non-integer, out-of-Int64 and resource-limited enum constants are Host refusals. The
  // C# codes CSHARP_ENUM_CONSTANT_NOT_SUPPORTED / _RESOURCE_LIMIT and the rejected projectTypeDefinition arm are
  // deleted; C# forwards each facts.refusals() entry with code, message and site unchanged.
  let received;
  const compiled = compileCsharpSource({ sourceText: `
export enum Text { Value = "value" }
export enum Fraction { Value = 7 / 2 }
export enum Outside { Value = 9223372036854775808 }
export enum Resource { Value = 2 ** 1000000000 }
export enum Incoherent { Exact = 9007199254740993, Next }
export enum Collision { Low = 9007199254740992, High = 9007199254740993 }
`, compileTarget(request, observer) { received = request; return compileCsharpAnalysisTarget(request, observer); } });
  assert.equal(received !== undefined, true, "the checked enums reach the target with their published refusals");
  assert.equal(compiled.result.program === undefined && compiled.artifacts.size === 0, true, "no refused enum acquires a native type definition");
  const source = received.input.source;
  const refusals = source.facts.refusals();
  const errors = compiled.result.diagnostics.filter(diagnostic => diagnostic.category === "error");
  const owners = new Set();
  for (const diagnostic of errors) {
    assert.equal(diagnostic.code.startsWith("TSONIC_"), true, `${diagnostic.code}: the refusal is Host-originated`);
    const published = refusals.filter(refusal => refusal.code === diagnostic.code && refusal.site === diagnostic.sourceNode);
    assert.equal(published.length, 1, "one published Host refusal per forwarded diagnostic");
    assert.equal(diagnostic.message, published[0].message, "the Host message is forwarded unchanged");
    let owner = diagnostic.sourceNode;
    while (owner !== undefined && !source.syntax.is.IsEnumDeclaration(owner)) owner = source.syntax.parent(owner);
    assert.equal(owner !== undefined, true, "the refusal site lies in an authored enum");
    owners.add(owner);
  }
  assert.equal(owners.size, 6, "every refused enum declaration has its own Host refusal");
});
