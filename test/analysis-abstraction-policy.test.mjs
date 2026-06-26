import { test } from "node:test";
import assert from "node:assert/strict";
import {
  analysisAbstractionDebtCatalog,
  analysisAbstractionDebtClassifications,
  analysisAbstractionDebtOwners,
  analysisAbstractionFileRules,
  analysisAbstractionRules,
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

test("architecture validator rejects procedural policy module names", () => {
  const proceduralPolicyRule = analysisAbstractionFileRules.find((rule) => rule.id === "procedural-policy-file");
  assert.notEqual(proceduralPolicyRule, undefined);
  assert.deepEqual(
    [
      "src/source/csharp-source-semantics/surfaces/js/policy.ts",
      "src/source/csharp-source-semantics/surfaces/js/property-policy.ts",
      "src/source/csharp-source-semantics/surfaces/js/calls/selection-policy.ts",
      "src/source/csharp-source-semantics/surfaces/js/array-carrier-lifecycle/array-use-policy.ts",
    ].map((file) => proceduralPolicyRule.pattern.test(file)),
    [true, true, true, true],
  );
  assert.deepEqual(
    [
      "src/source/csharp-source-semantics/surfaces/js/calls/closed-facts/index.ts",
      "src/source/csharp-source-semantics/surfaces/js/calls/target-selection.ts",
      "src/source/csharp-source-semantics/surfaces/js/array-carrier-lifecycle/array-use-rules.ts",
      "src/source/csharp-source-semantics/surfaces/js/properties/member-providers/index.ts",
    ].map((file) => proceduralPolicyRule.pattern.test(file)),
    [false, false, false, false],
  );
});

test("architecture validator rejects ad hoc source-member matcher calls", () => {
  const matcherRule = analysisAbstractionRules.find((rule) => rule.id === "source-library-member-ad-hoc-match");
  assert.notEqual(matcherRule, undefined);
  const forbidden = [
    "sourceLibraryMemberMatchesAny(sourceMember, arrayConstructorIds)",
    "sourceLibraryMemberMatchesAnyPrefix(sourceMember, consolePrefixes)",
  ];
  const allowed = [
    "function sourceLibraryMemberMatchesAny(sourceMember, ids) { return sourceLibraryMemberMatches(sourceMember, { ids }); }",
    "sourceLibraryMemberMatches(sourceMember, arrayConstructorIdentityPolicy)",
  ];
  assert.deepEqual(forbidden.map((text) => ruleMatches(matcherRule, text)), [true, true]);
  assert.deepEqual(allowed.map((text) => ruleMatches(matcherRule, text)), [false, false]);
});

test("architecture validator rejects per-module Node target identity maps", () => {
  const identityMapRule = analysisAbstractionRules.find((rule) => rule.id === "nodejs-direct-target-member-identity-map");
  assert.notEqual(identityMapRule, undefined);
  assert.deepEqual(
    [
      "const nodeFsTargetMembersByIdentity = new Map();",
      "const nodeBufferTargetMembersByIdentity = new Map();",
    ].map((text) => ruleMatches(identityMapRule, text)),
    [true, true],
  );
  assert.deepEqual(
    [
      "const nodejsTargetMemberByDeclarationIdentity = new Map();",
      "nodejsTargetMemberMetadataRecords().flatMap((record) => record.declarationIdentities)",
    ].map((text) => ruleMatches(identityMapRule, text)),
    [false, false],
  );
});

function ruleMatches(rule, text) {
  rule.pattern.lastIndex = 0;
  return rule.pattern.test(text);
}

function catalogedCounts() {
  const counts = new Map();
  for (const entry of analysisAbstractionDebtCatalog) {
    for (const [ruleId, count] of Object.entries(entry.counts)) {
      counts.set(`${entry.file}\u0000${ruleId}`, count);
    }
  }
  return counts;
}
