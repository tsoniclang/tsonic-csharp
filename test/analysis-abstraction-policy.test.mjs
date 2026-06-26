import { test } from "node:test";
import assert from "node:assert/strict";
import {
  analysisAbstractionDebtCatalog,
  analysisAbstractionDebtClassifications,
  analysisAbstractionDebtOwners,
  collectAnalysisAbstractionFindings,
  summarizeAnalysisAbstractionFindings,
} from "./architecture/analysis-abstraction-policy.mjs";

const repoRoot = new URL("..", import.meta.url).pathname;
const classificationSet = new Set(analysisAbstractionDebtClassifications);
const ownerSet = new Set(analysisAbstractionDebtOwners);

test("analysis abstraction debt catalog is explicit and reviewed", () => {
  const metadataErrors = [];
  for (const entry of analysisAbstractionDebtCatalog) {
    if (!classificationSet.has(entry.classification)) {
      metadataErrors.push(`${entry.file}: invalid classification ${entry.classification}`);
    }
    if (!ownerSet.has(entry.owner)) {
      metadataErrors.push(`${entry.file}: invalid owner ${entry.owner}`);
    }
    if (entry.replacement.trim().length === 0) {
      metadataErrors.push(`${entry.file}: missing replacement abstraction`);
    }
    if (entry.status !== "migration-required") {
      metadataErrors.push(`${entry.file}: invalid status ${entry.status}`);
    }
  }
  assert.deepEqual(metadataErrors, []);
});

test("product analysis code has no unclassified source-family or target-member algorithms", () => {
  const findings = collectAnalysisAbstractionFindings(repoRoot);
  const counts = summarizeAnalysisAbstractionFindings(findings);
  const catalogKeys = catalogedCounts();

  const unclassified = [];
  for (const key of counts.keys()) {
    if (!catalogKeys.has(key)) {
      const [file, ruleId] = key.split("\u0000");
      const examples = findings
        .filter((finding) => finding.file === file && finding.ruleId === ruleId)
        .slice(0, 3)
        .map((finding) => `${finding.line}: ${finding.snippet}`)
        .join(" | ");
      unclassified.push(`${file} ${ruleId}: ${examples}`);
    }
  }

  const drift = [];
  for (const [key, expectedCount] of catalogKeys) {
    const actualCount = counts.get(key) ?? 0;
    if (actualCount !== expectedCount) {
      const [file, ruleId] = key.split("\u0000");
      drift.push(`${file} ${ruleId}: expected ${expectedCount}, actual ${actualCount}`);
    }
  }

  assert.deepEqual({ unclassified, drift }, { unclassified: [], drift: [] });
});

function catalogedCounts() {
  const counts = new Map();
  for (const entry of analysisAbstractionDebtCatalog) {
    for (const [ruleId, count] of Object.entries(entry.counts)) {
      counts.set(`${entry.file}\u0000${ruleId}`, count);
    }
  }
  return counts;
}
