import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import {
  buildSelectedEvidenceAuditRows,
  collectSelectedEvidenceFindings,
  collectSelectedEvidenceFindingsForSource,
  expectedSharedSourceQuerySites,
  findingCounts,
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

test("every low-level source query site is explicitly inventoried", () => {
  const counts = findingCounts(
    collectSelectedEvidenceFindings(repoRoot).filter((finding) =>
      finding.ruleId.startsWith("source-query.")),
  );
  const actual = [...counts.entries()].sort(([left], [right]) =>
    left.localeCompare(right));
  const expected = [...expectedSharedSourceQuerySites.entries()]
    .map(([key, value]) => [key, value.count])
    .sort(([left], [right]) => left.localeCompare(right));
  assert.deepEqual(actual, expected);
});

test("every inventoried source query has an architecture classification", () => {
  const rows = buildSelectedEvidenceAuditRows(repoRoot)
    .filter((row) => row.ruleId.startsWith("source-query."));
  assert.equal(
    rows.length,
    [...expectedSharedSourceQuerySites.values()].reduce(
      (count, site) => count + site.count,
      0,
    ),
  );
  assert.deepEqual(
    rows.filter((row) =>
      row.classification !== "shared-source-semantics-query" ||
      row.purpose.length === 0 ||
      row.action.length === 0 ||
      row.coverage.length === 0),
    [],
  );
});

test("semantic product code contains no forbidden reconstruction mechanism", () => {
  const forbiddenRuleIds = new Set(
    selectedEvidenceForbiddenRules.map((rule) => rule.id),
  );
  const violations = collectSelectedEvidenceFindings(repoRoot)
    .filter((finding) => forbiddenRuleIds.has(finding.ruleId))
    .map((finding) =>
      `${finding.file}:${finding.line}: ${finding.ruleId}: ${finding.snippet}`);
  assert.deepEqual(violations, []);
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

test("operation selection consumes atomic shared semantic decisions", () => {
  const required = new Map([
    ["src/policy/members/selection/call-selection.ts", "getResolvedCallInfo"],
    ["src/policy/members/selection/property-selection.ts", "getResolvedPropertyAccessInfo"],
    ["src/policy/members/selection/element-selection.ts", "getResolvedElementAccessInfo"],
  ]);
  const violations = [];
  for (const [file, method] of required) {
    const source = readFileSync(join(repoRoot, file), "utf8");
    if (!source.includes(method)) {
      violations.push(`${file}: missing ${method}`);
    }
    if (/\b(?:getTypeAtLocation|getSymbolAtLocation|getResolvedSignature|getPropertyOfType)\s*\(/u.test(source)) {
      violations.push(`${file}: reconstructs selected operation identity`);
    }
  }
  assert.deepEqual(violations, []);
});

test("retired target observation and operation-fact architecture is absent", () => {
  const forbidden = /\b(?:registerTargetSemanticProvider|TargetSemanticProvider|TargetOperationFact|SelectedTargetSignatureFact|deferObservation|csharpRuntimeCarrierFactKey|recordCsharpRuntimeCarrierFact|csharpTargetOperationFact|surfaceTargetOperationFact)\b/gu;
  const hits = productHits(forbidden);
  assert.deepEqual(hits, []);
});

test("generic method type arguments come only from shared selected call evidence", () => {
  const forbidden = /\b(?:TypeArguments|getSourceCallTypeParameterSubstitutions|addInferredTargetTypeParameterSubstitutions|inferMethodTypeArguments|inferTypeArgumentsFromCallback)\b/gu;
  assert.deepEqual(productHits(forbidden), []);
  const consumers = productHits(/\bsourceSelectedMethodTypeArguments\b/gu);
  const consumerCounts = new Map();
  for (const consumer of consumers) {
    const file = consumer.slice(0, consumer.lastIndexOf(":"));
    consumerCounts.set(file, (consumerCounts.get(file) ?? 0) + 1);
  }
  assert.deepEqual([...consumerCounts.entries()].sort(), [
    ["src/policy/members/instantiation/instantiation.ts", 3],
    ["src/policy/members/source-profiles/js/arrays.ts", 3],
    ["src/policy/types/resolution/calls.ts", 2],
    ["src/policy/types/resolution/expressions.ts", 1],
  ]);
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
