import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { createSourceSyntaxIndex } from "./source-code-mask.mjs";
import { readArchitectureTypeScript } from "../../../tsonic/test/architecture/tooling/typescript-source.mjs";
import {
  collectSelectedEvidenceFindings,
  collectSelectedEvidenceFindingsForSource,
  selectedEvidenceForbiddenRules,
} from "./selected-evidence-audit.mjs";

const repoRoot = new URL("../..", import.meta.url).pathname;

test("selected-evidence scanner distinguishes compiler fields from non-code text", () => {
  const findings = collectSelectedEvidenceFindingsForSource("src/example.ts", [
    "",
    "const raw = node.Text;",
    'const namespaceName = "System.Text.Json";',
    "const template = `System.Text.Json ${node.Text}`;",
    "// ignored.Text",
    "/* ignored.Text */",
  ].join("\n"));
  assert.deepEqual(findings.map(({ ruleId, line }) => ({ ruleId, line })), [
    { ruleId: "raw-Text", line: 2 },
    { ruleId: "raw-Text", line: 4 },
  ]);
});

test("Native has no low-level Source checker query or classified exception", () => {
  assert.deepEqual(collectSelectedEvidenceFindings(repoRoot)
    .filter(finding => finding.ruleId.startsWith("source-query.")), []);
});

test("semantic product code contains no forbidden reconstruction mechanism", () => {
  const forbiddenRuleIds = new Set(
    selectedEvidenceForbiddenRules.map((rule) => rule.id),
  );
  const findings = collectSelectedEvidenceFindings(repoRoot).filter((finding) => forbiddenRuleIds.has(finding.ruleId));
  const metadata = findings.filter(finding => finding.file === "src/target-model/metadata/immutable.ts" && finding.ruleId === "raw-ownKeys");
  assert.equal(metadata.length, 1);
  assert.match(metadata[0].snippet, /Reflect\.ownKeys\(descriptors\)/u);
  const violations = findings
    .filter(finding => !metadata.includes(finding))
    .map((finding) =>
      `${finding.file}:${finding.line}: ${finding.ruleId}: ${finding.snippet}`);
  assert.deepEqual(violations, []);
});

test("metadata validation stays independent of compiler subjects and semantic reconstruction", () => {
  const metadata = readFileSync(join(repoRoot, "src/target-model/metadata/immutable.ts"), "utf8");
  const syntax = createSourceSyntaxIndex(new Map([["metadata.ts", metadata]]));
  assert.doesNotMatch(syntax("metadata.ts").code, /\bimport\b|\b(?:node|subject|symbol|signature|checker|semantics|sourceType)\b/u);
  const probe = 'const result = Reflect.ownKeys(node);';
  for (const file of ["src/analysis/project-types/type-definitions.ts", "src/target-model/types/snapshot.ts", "src/policy/example.ts"]) {
    assert.deepEqual(collectSelectedEvidenceFindingsForSource(file, probe).map(finding => finding.ruleId), ["raw-ownKeys"]);
  }
});

test("semantic product paths do not catch checker failures and continue", () => {
  const forbidden = sourceFiles(join(repoRoot, "src")).flatMap((file) => {
    const source = readFileSync(file, "utf8");
    return catchBlocks(source).flatMap(({ block, line }) => {
      const catchesSemanticFailure = /\b(?:semantics|queries)\.[A-Za-z_$][A-Za-z0-9_$]*\s*\(/u.test(block);
      const continuesWithMissingEvidence = /\breturn\s+(?:undefined|false|null)\b/u.test(block);
      return catchesSemanticFailure && continuesWithMissingEvidence
        ? [`${relative(repoRoot, file).split(sep).join("/")}:${line}`]
        : [];
    });
  });
  assert.deepEqual(forbidden, []);
});

test("C# consumes shared source semantics instead of raw compiler query containers", () => {
  const rules = [
    ["raw checker container", /\.checker\b/gu],
    ["raw type-shape container", /\.typeShape\b/gu],
    ["raw source-file query type", /\bSourceFileQueries\b/gu],
    ["raw type-checker query type", /\bTypeCheckerQueries\b/gu],
    ["raw type-shape query type", /\bTypeShapeQueries\b/gu],
    ["raw source-file query factory", /\bgetSourceFileQueries\b/gu],
    ["raw checked program", /\bCheckedSourceProgram\b/gu],
  ];
  const violations = sourceFiles(join(repoRoot, "src")).flatMap((file) => {
    const source = readFileSync(file, "utf8");
    const relativeFile = relative(repoRoot, file).split(sep).join("/");
    return rules.flatMap(([name, pattern]) => {
      pattern.lastIndex = 0;
      return [...source.matchAll(pattern)].map((match) =>
        `${relativeFile}:${source.slice(0, match.index).split("\n").length}: ${name}`);
    });
  });
  assert.deepEqual(violations, []);
});

test("the central application adapter reads the original complete Source publication once", () => {
  const owner = sourceFunction("src/analysis/source-evidence/representations.ts", "representCsharpApplication");
  const queries = owner.nodes.filter(node => owner.ast.is.IsCallExpression(node) &&
    owner.text(owner.ast.as.AsCallExpression(node).Expression) === "host.facts.applications.application");
  assert.equal(queries.length, 1, "one canonical Source application read in its adapter");
  assert.equal(owner.text(owner.ast.arguments(queries[0])[0]), "occurrence", "the query uses the original occurrence");
  const properties = new Set(owner.nodes.filter(node => owner.ast.is.IsPropertyAccessExpression(node)).map(owner.text));
  for (const field of ["source.identity.invocation", "source.identity.signature", "source.receiver", "source.sourceArguments", "source.arguments", "source.result"]) {
    assert.equal(properties.has(field), true, `the adapter explicitly reads ${field}, not only a result type`);
  }
});

test("operation selection consumes atomic shared semantic decisions", () => {
  for (const [path, name, query] of [
    ["src/analysis/operations/members/calls/selection.ts", "selectCsharpProviderCall", "host.facts.applications.application"],
    ["src/analysis/operations/members/property-selection.ts", "selectCsharpProviderProperty", "host.facts.objects.use"],
    ["src/analysis/operations/members/element-selection.ts", "selectCsharpProviderElement", "host.facts.objects.use"],
  ]) {
    const owner = sourceFunction(path, name);
    const parameter = owner.ast.parameters(owner.declaration)[1];
    assert.equal(parameter !== undefined, true, `${name} declares its original occurrence parameter`);
    const occurrence = owner.ast.name(parameter);
    assert.equal(occurrence !== undefined, true, `${name} declares its original occurrence parameter`);
    const queries = owner.nodes.filter(node => owner.ast.is.IsCallExpression(node) &&
      owner.text(owner.ast.as.AsCallExpression(node).Expression) === query);
    assert.equal(queries.length, 1, `${name} reads one canonical Source operation publication`);
    const queryArguments = owner.ast.arguments(queries[0]);
    assert.equal(queryArguments.length, 1, `${name} queries exactly one original occurrence`);
    const original = owner.checker.getSymbolAtLocation(occurrence);
    assert.equal(original !== undefined, true, `${name} occurrence has its original lexical identity`);
    assert.equal(owner.ast.is.IsIdentifier(queryArguments[0]) &&
      owner.checker.getLexicallyResolvedSymbol(queryArguments[0]) === original, true, `${name} queries its original occurrence`);
  }
});

test("RegExp literals consume structured TSTS syntax without target parsing", () => {
  const policy = readFileSync(
    join(repoRoot, "src/analysis/operations/syntax/regexp-literal.ts"),
    "utf8",
  );
  assert.match(policy, /\.regularExpressionLiteral\(node\)/u);
  assert.doesNotMatch(
    policy,
    /\b(?:ast\.text|lastIndexOf|startsWith|parseRegularExpressionLiteral|validateCsharpJsRegExpPatternAndFlags)\b/u,
  );
  const product = sourceFiles(join(repoRoot, "src"))
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
  assert.doesNotMatch(
    product,
    /\b(?:parseRegularExpressionLiteral|validateCsharpJsRegExpPatternAndFlags)\b/u,
  );
});

test("retired target observation and operation-fact architecture is absent", () => {
  const forbidden = /\b(?:registerTargetSemanticProvider|TargetSemanticProvider|TargetOperationFact|SelectedTargetSignatureFact|deferObservation|csharpRuntimeCarrierFactKey|recordCsharpRuntimeCarrierFact|csharpTargetOperationFact|surfaceTargetOperationFact)\b/gu;
  const hits = productHits(forbidden);
  assert.deepEqual(hits, []);
});

test("generic method type arguments come only from shared selected call evidence", () => {
  const forbidden = /\b(?:TypeArguments|sourceSelectedMethodTypeArguments|getSourceCallTypeParameterSubstitutions|addInferredTargetTypeParameterSubstitutions|inferMethodTypeArguments|inferTypeArgumentsFromCallback)\b/gu;
  assert.deepEqual(productHits(forbidden), []);
  const owner = sourceFunction("src/analysis/source-evidence/representations.ts", "representCsharpApplication");
  const properties = new Set(owner.nodes.filter(node => owner.ast.is.IsPropertyAccessExpression(node)).map(owner.text));
  assert.equal(properties.has("source.identity.classBindings"), true, "original class bindings are an independent Source vector");
  assert.equal(properties.has("source.identity.signatureBindings"), true, "original method bindings are an independent Source vector");
});

test("provider relations never recover identity through optional fallback", () => {
  const forbidden = /\b(?:providerSourceSignatureId|providerMemberId\s*\?\?|providerDisambiguatedMemberId|getTargetMemberCandidatesForSelectedMember|getTargetArgumentSubjectsForMember)\b/gu;
  assert.deepEqual(productHits(forbidden), []);
});

test("selected-evidence fixtures do not fabricate non-contract request fields", () => {
  const scannerFile = new URL(import.meta.url).pathname;
  const hits = sourceFiles(join(repoRoot, "test"))
    .filter((file) => file !== scannerFile)
    .filter((file) =>
      readFileSync(file, "utf8").includes("sourceSelectedContainerSymbol"))
    .map((file) => relative(repoRoot, file).split(sep).join("/"));
  assert.deepEqual(hits, []);
});

function sourceFunction(path, name) {
  const checked = readArchitectureTypeScript(new Map([[path, readFileSync(join(repoRoot, path), "utf8")]]));
  const ast = checked.ast;
  const file = checked.getSourceFile(`/architecture/${path}`);
  const declarations = ast.statements(file).filter(node => ast.is.IsFunctionDeclaration(node) && ast.text(ast.name(node)) === name);
  assert.equal(declarations.length, 1, `one concrete current ${name} owner, not a synthetic consumer`);
  const nodes = [];
  const visit = node => {
    nodes.push(node);
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  visit(declarations[0]);
  const text = node => {
    const range = ast.authoredRange(node);
    return range.kind === "authored" ? ast.getSourceText(file).slice(range.start, range.end) : undefined;
  };
  return { ast, checker: checked.getSourceFileQueries(file).checker, declaration: declarations[0], nodes, text };
}

function productHits(pattern) {
  return sourceFiles(join(repoRoot, "src")).flatMap((file) => {
    const source = readFileSync(file, "utf8");
    pattern.lastIndex = 0;
    return [...source.matchAll(pattern)].map((match) =>
      `${relative(repoRoot, file).split(sep).join("/")}:${source.slice(0, match.index).split("\n").length}`);
  });
}

function sourceFiles(directory) {
  return readdirSync(directory).flatMap((entryName) => {
    const path = join(directory, entryName);
    return statSync(path).isDirectory()
      ? sourceFiles(path)
      : path.endsWith(".mjs") || path.endsWith(".ts")
        ? [path]
        : [];
  });
}

function catchBlocks(text) {
  const blocks = [];
  const pattern = /\bcatch\s*(?:\([^)]*\))?\s*\{/gu;
  for (const match of text.matchAll(pattern)) {
    const open = (match.index ?? 0) + match[0].lastIndexOf("{");
    let depth = 1;
    let index = open + 1;
    while (index < text.length && depth > 0) {
      if (text[index] === "{") depth += 1;
      if (text[index] === "}") depth -= 1;
      index += 1;
    }
    blocks.push({
      block: text.slice(open + 1, Math.max(open + 1, index - 1)),
      line: text.slice(0, open).split("\n").length,
    });
  }
  return blocks;
}
