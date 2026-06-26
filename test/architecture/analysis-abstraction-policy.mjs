import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

export const analysisAbstractionRules = Object.freeze([
  {
    id: "source-member-declaring-name",
    pattern: /sourceMember\.declaringName/g,
    replacement:
      "Use selected TSTS declaration/signature identity, then policy/provider facts.",
  },
  {
    id: "source-member-name",
    pattern: /sourceMember\.memberName/g,
    replacement:
      "Use selected TSTS declaration/signature identity, then policy/provider facts.",
  },
  {
    id: "source-library-type-check",
    pattern: /isSourceLibraryType\s*\(/g,
    replacement:
      "Use source identity/type-classification facts instead of source-library family branches.",
  },
  {
    id: "source-library-member-read",
    pattern: /getSourceLibraryMember\s*\(/g,
    replacement:
      "Read source-library members only inside source identity or policy adapters.",
  },
  {
    id: "target-member-helper",
    pattern: /\btarget(?:Method|Property|Constructor)\s*\(/g,
    replacement:
      "Represent target members as provider metadata or explicit policy exceptions.",
  },
  {
    id: "target-member-table",
    pattern: /\bget[A-Za-z0-9]+TargetMembers\s*\(/g,
    replacement:
      "Select target members through generic provider metadata selectors.",
  },
  {
    id: "product-console-debug",
    pattern: /\bconsole\.(?:error|log|warn|debug)\s*\(/g,
    replacement:
      "Use structured diagnostics or test-only logging outside product source.",
  },
  {
    id: "semantic-fallback-word",
    pattern: /\bfallback\b/gi,
    replacement:
      "Classify as harmless syntax fallback or replace semantic fallback with fail-closed diagnostics.",
  },
]);

export const analysisAbstractionDebtClassifications = Object.freeze([
  "source-identity-policy-candidate",
  "provider-metadata-candidate",
  "surface-policy-candidate",
  "type-classification-candidate",
  "object-shape-classification-candidate",
  "backend-fact-boundary-candidate",
  "explicit-exception-candidate",
  "delete-bug-candidate",
]);

export const analysisAbstractionDebtOwners = Object.freeze([
  "source-core-provider",
  "target-provider",
  "surface-provider",
  "csharp-backend",
  "csharp-runtime",
  "tests",
]);

export const analysisAbstractionDebtCatalog = Object.freeze([
  entry("src/backend/planner/binding-array-patterns.ts", { "semantic-fallback-word": 3 }, "backend-fact-boundary-candidate", "csharp-backend", "Review fallback wording and keep only syntactic default-binding handling; semantic recovery must be a diagnostic."),
  entry("src/backend/planner/source-paths.ts", { "semantic-fallback-word": 2 }, "backend-fact-boundary-candidate", "csharp-backend", "Classify path fallback as syntactic path rendering or replace with explicit source-path facts."),
  entry("src/source/csharp-source-semantics/dictionaries.ts", { "target-member-table": 2 }, "provider-metadata-candidate", "target-provider", "Move dictionary target members behind provider metadata and selected member facts."),
  entry("src/source/csharp-source-semantics/operations-provider.ts", { "source-library-member-read": 2 }, "source-identity-policy-candidate", "target-provider", "Replace direct library probing with selected source identity and provider policy facts."),
  entry("src/source/csharp-source-semantics/runtime-carrier-lifecycle/expected-context-propagation.ts", { "semantic-fallback-word": 1 }, "backend-fact-boundary-candidate", "target-provider", "Verify fallback wording is non-semantic; lifecycle propagation must fail closed when facts are absent."),
  entry("src/source/csharp-source-semantics/source-library.ts", { "source-library-type-check": 1, "source-library-member-read": 1 }, "source-identity-policy-candidate", "surface-provider", "Keep source-library inspection centralized here until replaced by selected declaration identity records."),
  entry("src/source/csharp-source-semantics/source-type-classification.ts", { "source-library-type-check": 1 }, "type-classification-candidate", "target-provider", "Centralize source standard-library type names in one classification policy before generic analysis consumes category facts."),
  entry("src/source/csharp-source-semantics/surfaces/js/array-carrier-lifecycle/array-use-policy.ts", { "source-member-declaring-name": 4, "source-member-name": 10 }, "surface-policy-candidate", "surface-provider", "Convert array-use policy from member-name checks to selected source identity policy entries."),
  entry("src/source/csharp-source-semantics/surfaces/js/array-carrier-lifecycle/source-library-selection.ts", { "source-library-member-read": 1 }, "source-identity-policy-candidate", "surface-provider", "Limit source-library reads to identity extraction, then expose selected source identity facts."),
  entry("src/source/csharp-source-semantics/surfaces/js/array-carriers.ts", { "source-library-member-read": 1 }, "surface-policy-candidate", "surface-provider", "Move array carrier decisions to selected source identities and carrier policies."),
  entry("src/source/csharp-source-semantics/surfaces/js/arrays/target-members.ts", { "target-member-helper": 2, "target-member-table": 1 }, "provider-metadata-candidate", "surface-provider", "Represent JS array target members as provider metadata or explicit exceptions."),
  entry("src/source/csharp-source-semantics/surfaces/js/booleans.ts", { "target-member-helper": 1, "target-member-table": 1 }, "provider-metadata-candidate", "surface-provider", "Represent JS Boolean members as provider metadata or explicit exceptions."),
  entry("src/source/csharp-source-semantics/surfaces/js/calls/diagnostics.ts", { "source-member-declaring-name": 3, "source-member-name": 3 }, "surface-policy-candidate", "surface-provider", "Diagnostics should cite selected source identities rather than branch on library family names."),
  entry("src/source/csharp-source-semantics/surfaces/js/calls/dispatch.ts", { "source-library-member-read": 1 }, "surface-policy-candidate", "surface-provider", "Use selected source identity facts before dispatching call policies."),
  entry("src/source/csharp-source-semantics/surfaces/js/calls/lifecycle.ts", { "source-member-name": 1, "source-library-member-read": 1 }, "surface-policy-candidate", "surface-provider", "Lifecycle call recording should use selected source identity and policy facts."),
  entry("src/source/csharp-source-semantics/surfaces/js/calls/operations.ts", { "source-member-declaring-name": 2, "source-member-name": 2 }, "surface-policy-candidate", "surface-provider", "Operation recording should use selected source operation policy, not source-family names."),
  entry("src/source/csharp-source-semantics/surfaces/js/calls/selection-policy.ts", { "source-member-declaring-name": 9, "source-member-name": 7 }, "surface-policy-candidate", "surface-provider", "Convert call selection policy entries to selected declaration/signature identity records."),
  entry("src/source/csharp-source-semantics/surfaces/js/collection-target-metadata.ts", { "source-member-declaring-name": 3, "source-member-name": 2, "target-member-helper": 2, "target-member-table": 1 }, "provider-metadata-candidate", "surface-provider", "Collection target metadata is isolated from collection carrier lifecycle; next step is replacing SourceLibraryMember name lookup with selected source identity records."),
  entry("src/source/csharp-source-semantics/surfaces/js/console.ts", { "source-member-declaring-name": 3, "source-member-name": 4, "target-member-helper": 1 }, "provider-metadata-candidate", "surface-provider", "Map console through selected JS surface policy and provider metadata."),
  entry("src/source/csharp-source-semantics/surfaces/js/date.ts", { "target-member-helper": 3, "target-member-table": 1 }, "explicit-exception-candidate", "surface-provider", "Date call/new differences must be explicit exceptions with provider target metadata."),
  entry("src/source/csharp-source-semantics/surfaces/js/dictionaries.ts", { "target-member-table": 1 }, "provider-metadata-candidate", "surface-provider", "Move dictionary surface members behind provider metadata."),
  entry("src/source/csharp-source-semantics/surfaces/js/dictionary-lifecycle.ts", { "target-member-table": 1 }, "provider-metadata-candidate", "surface-provider", "Use carrier policy/provider metadata for dictionary lifecycle target members."),
  entry("src/source/csharp-source-semantics/surfaces/js/iteration.ts", { "target-member-table": 1 }, "provider-metadata-candidate", "surface-provider", "Iteration target members must come from provider metadata and iteration facts."),
  entry("src/source/csharp-source-semantics/surfaces/js/json.ts", { "source-member-name": 1, "source-library-member-read": 1, "target-member-helper": 1, "target-member-table": 1 }, "explicit-exception-candidate", "surface-provider", "JSON stringify/parse policies must be explicit exceptions with selected source identity and provider facts."),
  entry("src/source/csharp-source-semantics/surfaces/js/math.ts", { "target-member-helper": 2, "target-member-table": 1 }, "provider-metadata-candidate", "surface-provider", "Represent Math static members as provider metadata."),
  entry("src/source/csharp-source-semantics/surfaces/js/numbers.ts", { "target-member-helper": 3, "target-member-table": 1 }, "provider-metadata-candidate", "surface-provider", "Represent Number members as provider metadata or explicit exceptions."),
  entry("src/source/csharp-source-semantics/surfaces/js/objects.ts", { "target-member-helper": 2, "target-member-table": 3 }, "provider-metadata-candidate", "surface-provider", "Object operations must use object-shape/provider facts and explicit exceptions."),
  entry("src/source/csharp-source-semantics/surfaces/js/policy.ts", { "source-member-declaring-name": 20, "source-member-name": 55, "target-member-table": 18 }, "surface-policy-candidate", "surface-provider", "Keep current concrete policy data cataloged while moving to selected source identity and provider metadata registries."),
  entry("src/source/csharp-source-semantics/surfaces/js/properties.ts", { "source-member-declaring-name": 5, "source-member-name": 6, "source-library-member-read": 2 }, "surface-policy-candidate", "surface-provider", "Property handling must consume property policy facts, not inspect source names directly."),
  entry("src/source/csharp-source-semantics/surfaces/js/property-policy.ts", { "source-member-declaring-name": 15, "source-member-name": 14, "target-member-helper": 2, "target-member-table": 1 }, "surface-policy-candidate", "surface-provider", "Convert property policy entries to selected declaration identity plus provider metadata."),
  entry("src/source/csharp-source-semantics/surfaces/js/regexp.ts", { "target-member-helper": 4, "target-member-table": 1 }, "provider-metadata-candidate", "surface-provider", "Represent RegExp operations as provider metadata or explicit exceptions."),
  entry("src/source/csharp-source-semantics/surfaces/js/strings.ts", { "target-member-helper": 3, "target-member-table": 1 }, "provider-metadata-candidate", "surface-provider", "Represent String members as provider metadata or explicit exceptions."),
  entry("src/source/csharp-source-semantics/surfaces/js/unsupported.ts", { "source-member-declaring-name": 6, "source-member-name": 4 }, "surface-policy-candidate", "surface-provider", "Unsupported-member diagnostics must key off selected identities and lane classifications."),
  entry("src/source/csharp-source-semantics/surfaces/nodejs/assert.ts", { "target-member-helper": 1 }, "provider-metadata-candidate", "surface-provider", "Represent Node assert members as provider metadata."),
  entry("src/source/csharp-source-semantics/surfaces/nodejs/buffer/instance-members.ts", { "target-member-helper": 4 }, "provider-metadata-candidate", "surface-provider", "Represent Buffer instance members as provider metadata."),
  entry("src/source/csharp-source-semantics/surfaces/nodejs/buffer/static-members.ts", { "target-member-helper": 13 }, "provider-metadata-candidate", "surface-provider", "Represent Buffer static members as provider metadata."),
  entry("src/source/csharp-source-semantics/surfaces/nodejs/crypto.ts", { "target-member-helper": 1 }, "provider-metadata-candidate", "surface-provider", "Represent Node crypto members as provider metadata."),
  entry("src/source/csharp-source-semantics/surfaces/nodejs/filesystem.ts", { "target-member-helper": 5 }, "provider-metadata-candidate", "surface-provider", "Represent Node fs members as provider metadata."),
  entry("src/source/csharp-source-semantics/surfaces/nodejs/os.ts", { "target-member-helper": 2 }, "provider-metadata-candidate", "surface-provider", "Represent Node os members as provider metadata."),
  entry("src/source/csharp-source-semantics/surfaces/nodejs/path.ts", { "target-member-helper": 3 }, "provider-metadata-candidate", "surface-provider", "Represent Node path members as provider metadata."),
  entry("src/source/csharp-source-semantics/surfaces/nodejs/process.ts", { "target-member-helper": 2 }, "provider-metadata-candidate", "surface-provider", "Represent Node process members as provider metadata."),
  entry("src/source/csharp-source-semantics/surfaces/nodejs/url/target-members.ts", { "target-member-helper": 3 }, "provider-metadata-candidate", "surface-provider", "Represent Node URL members as provider metadata."),
  entry("src/source/csharp-source-semantics/surfaces/nodejs/util.ts", { "target-member-helper": 1 }, "provider-metadata-candidate", "surface-provider", "Represent Node util members as provider metadata."),
  entry("src/source/csharp-source-semantics/target-types/member-facts.ts", { "target-member-helper": 2 }, "provider-metadata-candidate", "target-provider", "Keep target member constructors cataloged until replaced by provider metadata builders."),
]);

export function collectAnalysisAbstractionFindings(repoRoot) {
  return sourceFiles(join(repoRoot, "src")).flatMap((filePath) => {
    const file = relative(repoRoot, filePath).split(sep).join("/");
    const text = readFileSync(filePath, "utf8");
    return analysisAbstractionRules.flatMap((rule) => collectRuleFindings(file, text, rule));
  });
}

export function summarizeAnalysisAbstractionFindings(findings) {
  const counts = new Map();
  for (const finding of findings) {
    const key = `${finding.file}\u0000${finding.ruleId}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function collectRuleFindings(file, text, rule) {
  rule.pattern.lastIndex = 0;
  return [...text.matchAll(rule.pattern)].map((match) => ({
    file,
    ruleId: rule.id,
    line: lineNumberAt(text, match.index ?? 0),
    snippet: lineAt(text, match.index ?? 0).trim(),
    replacement: rule.replacement,
  }));
}

function lineNumberAt(text, index) {
  let line = 1;
  for (let offset = 0; offset < index; offset += 1) {
    if (text.charCodeAt(offset) === 10) {
      line += 1;
    }
  }
  return line;
}

function lineAt(text, index) {
  const start = text.lastIndexOf("\n", index) + 1;
  const end = text.indexOf("\n", index);
  return text.slice(start, end === -1 ? text.length : end);
}

function sourceFiles(directory) {
  return readdirSync(directory).flatMap((entryName) => {
    const path = join(directory, entryName);
    return statSync(path).isDirectory()
      ? sourceFiles(path)
      : path.endsWith(".ts")
        ? [path]
        : [];
  });
}

function entry(file, counts, classification, owner, replacement) {
  return Object.freeze({
    file,
    counts: Object.freeze(counts),
    classification,
    owner,
    replacement,
    status: "migration-required",
  });
}
