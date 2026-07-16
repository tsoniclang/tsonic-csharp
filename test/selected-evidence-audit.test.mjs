import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import {
  buildSelectedEvidenceAuditRows,
  collectSelectedEvidenceFindingsForSource,
  collectSelectedEvidenceFindings,
  selectedEvidenceAuditedFiles,
  selectedEvidenceClassifications,
  selectedEvidenceFileClassifications,
} from "./architecture/selected-evidence-audit.mjs";

const repoRoot = new URL("..", import.meta.url).pathname;
const classificationSet = new Set(selectedEvidenceClassifications);

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

test("selected-evidence audit inventory covers every current product risk-pattern file", () => {
  const matchedFiles = [...new Set(collectSelectedEvidenceFindings(repoRoot).map((finding) => finding.file))].sort();
  assert.deepEqual(selectedEvidenceAuditedFiles(), matchedFiles);
});

test("selected-evidence audit inventory expands every matched occurrence into a classified row", () => {
  const findings = collectSelectedEvidenceFindings(repoRoot);
  const rows = buildSelectedEvidenceAuditRows(repoRoot);
  assert.equal(rows.length, findings.length);
  assert.equal(rows.some((row) => row.symbol === "unclassified"), false);

  const invalid = rows.filter((row) =>
    !classificationSet.has(row.classification) ||
    row.symbol.trim().length === 0 ||
    row.purpose.trim().length === 0 ||
    row.action.trim().length === 0 ||
    row.coverage.trim().length === 0 ||
    row.snippet.trim().length === 0);
  assert.deepEqual(invalid, []);
});

test("selected-evidence audit classifies only files that still contain risk-pattern hits", () => {
  const matchedFiles = new Set(collectSelectedEvidenceFindings(repoRoot).map((finding) => finding.file));
  const stale = [...selectedEvidenceFileClassifications.keys()]
    .filter((file) => !matchedFiles.has(file))
    .sort();
  assert.deepEqual(stale, []);
});

test("selected-evidence audit rejects silent semantic recovery mechanisms", () => {
  const forbiddenRuleIds = new Set([
    "safe-helper",
    "source-usage-channel",
    "checker-forcing-operation-lifecycle",
    "raw-TypeArguments",
    "raw-Text",
    "target-analysis-selected-call-query",
    "local-method-type-argument-reconstruction",
    "source-marker-name-reconstruction",
    "contextual-target-type-requery",
    "single-target-member-inference",
  ]);
  const forbidden = buildSelectedEvidenceAuditRows(repoRoot)
    .filter((row) =>
      forbiddenRuleIds.has(row.ruleId) ||
      (row.ruleId === "broad-catch-return" && (
        row.file.startsWith("src/source/csharp-source-semantics/") ||
        row.file.startsWith("src/backend/")
      )))
    .map((row) => `${row.file}:${row.line}: ${row.ruleId}: ${row.snippet}`);
  assert.deepEqual(forbidden, []);
});

test("semantic product paths do not catch checker failures and continue", () => {
  const roots = [
    join(repoRoot, "src/source/csharp-source-semantics"),
    join(repoRoot, "src/backend"),
  ];
  const forbidden = roots.flatMap(sourceFiles).flatMap((file) => {
    const text = readFileSync(file, "utf8");
    return catchBlocks(text).flatMap(({ block, line }) => {
      const catchesCheckerFailure = /\b(?:checker|typeShape)\.[A-Za-z_$][A-Za-z0-9_$]*\s*\(/u.test(block);
      const continuesWithMissingEvidence = /\breturn\s+(?:undefined|false|null)\b/u.test(block);
      return catchesCheckerFailure || continuesWithMissingEvidence
        ? [`${relative(repoRoot, file).split(sep).join("/")}:${line}`]
        : [];
    });
  });
  assert.deepEqual(forbidden, []);
});

test("selected-evidence audit has no unresolved local abstraction or lifecycle classifications", () => {
  const unresolved = buildSelectedEvidenceAuditRows(repoRoot)
    .filter((row) => row.classification === "wrong-abstraction-reworked" || row.classification === "lifecycle-ordering-bug")
    .map((row) => `${row.file}:${row.line}: ${row.classification}: ${row.symbol}`);
  assert.deepEqual(unresolved, []);
});

test("selected-evidence fixtures do not fabricate non-contract request fields", () => {
  const forbidden = "sourceSelectedContainerSymbol";
  const scannerFile = new URL(import.meta.url).pathname;
  const hits = sourceFiles(join(repoRoot, "test"))
    .filter((file) => file !== scannerFile)
    .filter((file) => readFileSync(file, "utf8").includes(forbidden))
    .map((file) => relative(repoRoot, file).split(sep).join("/"));
  assert.deepEqual(hits, []);
});

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
      if (text[index] === "{") {
        depth += 1;
      } else if (text[index] === "}") {
        depth -= 1;
      }
      index += 1;
    }
    blocks.push({
      block: text.slice(open + 1, Math.max(open + 1, index - 1)),
      line: text.slice(0, open).split("\n").length,
    });
  }
  return blocks;
}
