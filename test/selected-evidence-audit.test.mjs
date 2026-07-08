import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildSelectedEvidenceAuditRows,
  collectSelectedEvidenceFindings,
  selectedEvidenceAuditedFiles,
  selectedEvidenceClassifications,
  selectedEvidenceFileClassifications,
} from "./architecture/selected-evidence-audit.mjs";

const repoRoot = new URL("..", import.meta.url).pathname;
const classificationSet = new Set(selectedEvidenceClassifications);

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
