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
    id: "source-member-id-branch",
    pattern: /sourceMember\.id\s*(?:={2,3}|!={1,2})/g,
    replacement:
      "Use declarative source identity policy records instead of source-member id control-flow branches.",
  },
  {
    id: "source-member-id-optional-branch",
    pattern: /sourceMember\?\.id\s*(?:={2,3}|!={1,2})/g,
    replacement:
      "Use declarative source identity policy records instead of optional-chained source-member id control-flow branches.",
  },
  {
    id: "source-member-id-prefix-branch",
    pattern: /sourceMember\.id\.startsWith\s*\(/g,
    replacement:
      "Use declarative source identity policy records instead of source-member prefix control-flow branches.",
  },
  {
    id: "candidate-target-id-branch",
    pattern: /candidate\.id\s*(?:={2,3}|!={1,2})/g,
    replacement:
      "Select target members with provider metadata and the generic selector, not target id control-flow branches.",
  },
  {
    id: "source-name-branch",
    pattern: /\bsourceName\s*(?:={2,3}|!={1,2})\s*["']/g,
    replacement:
      "Concrete source names belong in declarative policy/provider metadata, not generic control-flow branches.",
  },
  {
    id: "source-name-switch",
    pattern: /switch\s*\(\s*sourceName\s*\)/g,
    replacement:
      "Concrete source names belong in declarative policy/provider metadata, not switch-based selectors.",
  },
  {
    id: "export-name-switch",
    pattern: /switch\s*\(\s*exportName\s*\)/g,
    replacement:
      "Concrete provider export names belong in declarative metadata tables, not switch-based selectors.",
  },
  {
    id: "member-declaring-name-branch",
    pattern: /\bmember\.declaringName\s*(?:={2,3}|!={1,2})\s*["']/g,
    replacement:
      "Concrete declaring names belong in declarative source identity metadata, not generic control-flow branches.",
  },
  {
    id: "candidate-target-id-find",
    pattern: /candidates\.find\s*\(\s*\(?\s*candidate\s*\)?\s*=>\s*candidate\.id/g,
    replacement:
      "Index provider metadata by selected source declaration/signature identity instead of scanning candidates by target id.",
  },
  {
    id: "source-library-declaring-name-type",
    pattern: /\bSourceLibraryDeclaringName\b/g,
    replacement:
      "Keep concrete TypeScript library names inside source identity extraction or declarative policy data only.",
  },
  {
    id: "source-library-member-id-type",
    pattern: /\bSourceLibraryMemberId\b/g,
    replacement:
      "Keep concrete TypeScript library member ids inside source identity extraction or declarative policy data only.",
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
    id: "module-specifier-branch",
    pattern: /\b(?:canonicalDeclaration|canonicalSpecifier|declaration|symbol)\.moduleSpecifier\s*===/g,
    replacement:
      "Select provider modules through canonical provider metadata indexes, not branch chains on module specifiers.",
  },
  {
    id: "provider-identity-key-map",
    pattern: /nodejsProvider(?:Export|Symbol|Declaration)?(?:Symbol|Declaration)?IdentityKey\s*\(/g,
    replacement:
      "Keep provider identity key construction inside metadata indexing utilities and remove generic selector dependence on concrete Node module/member names.",
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
  entry("src/backend/planner/expression-source-references.ts", { "source-name-branch": 1 }, "source-identity-policy-candidate", "csharp-backend", "Undefined/global source reference handling must move to source identity facts or explicit global policy records."),
  entry("src/backend/planner/source-paths.ts", { "semantic-fallback-word": 2 }, "backend-fact-boundary-candidate", "csharp-backend", "Classify path fallback as syntactic path rendering or replace with explicit source-path facts."),
  entry("src/providers/dotnet/declaration-model/members.ts", { "source-name-branch": 1 }, "provider-metadata-candidate", "target-provider", "Constructor source-name normalization belongs in provider declaration metadata construction, not scattered branch logic."),
  entry("src/providers/dotnet/native-array.ts", { "source-name-branch": 1 }, "provider-metadata-candidate", "target-provider", "Native Array provider detection must become provider identity metadata rather than a concrete source-name branch."),
  entry("src/source/csharp-source-semantics/dictionaries.ts", { "target-member-table": 2 }, "provider-metadata-candidate", "target-provider", "Move dictionary target members behind provider metadata and selected member facts."),
  entry("src/source/csharp-source-semantics/operations-provider.ts", { "source-library-member-read": 2 }, "source-identity-policy-candidate", "target-provider", "Replace direct library probing with selected source identity and provider policy facts."),
  entry("src/source/csharp-source-semantics/runtime-carrier-lifecycle/expected-context-propagation.ts", { "semantic-fallback-word": 1 }, "backend-fact-boundary-candidate", "target-provider", "Verify fallback wording is non-semantic; lifecycle propagation must fail closed when facts are absent."),
  entry("src/source/csharp-source-semantics/source-library.ts", { "source-member-name": 1, "source-member-id-prefix-branch": 1, "source-library-type-check": 1, "source-library-member-read": 1, "source-library-declaring-name-type": 8, "source-library-member-id-type": 7 }, "source-identity-policy-candidate", "surface-provider", "Keep source-library inspection centralized here until replaced by selected declaration identity records."),
  entry("src/source/csharp-source-semantics/source-type-classification.ts", { "source-library-type-check": 1, "source-library-declaring-name-type": 2 }, "type-classification-candidate", "target-provider", "Centralize source standard-library type names in one classification policy before generic analysis consumes category facts."),
  entry("src/source/csharp-source-semantics/surfaces/js/array-carrier-lifecycle/array-use-policy.ts", { "source-library-member-id-type": 5 }, "surface-policy-candidate", "surface-provider", "Array carrier use policy must become declarative source identity policy with carrier facts and explicit exception records."),
  entry("src/source/csharp-source-semantics/surfaces/js/array-carrier-lifecycle/source-library-selection.ts", { "source-library-member-read": 1, "member-declaring-name-branch": 3 }, "source-identity-policy-candidate", "surface-provider", "Limit source-library reads to identity extraction, then expose selected source identity facts."),
  entry("src/source/csharp-source-semantics/surfaces/js/array-carriers.ts", { "source-library-member-read": 1 }, "surface-policy-candidate", "surface-provider", "Move array carrier decisions to selected source identities and carrier policies."),
  entry("src/source/csharp-source-semantics/surfaces/js/arrays/target-members.ts", { "target-member-helper": 2, "target-member-table": 1, "source-name-switch": 1 }, "provider-metadata-candidate", "surface-provider", "Represent JS array target members as provider metadata or explicit exceptions."),
  entry("src/source/csharp-source-semantics/surfaces/js/calls/dispatch.ts", { "source-library-member-read": 1 }, "surface-policy-candidate", "surface-provider", "Use selected source identity facts before dispatching call policies."),
  entry("src/source/csharp-source-semantics/surfaces/js/calls/lifecycle.ts", { "source-library-member-read": 1 }, "surface-policy-candidate", "surface-provider", "Lifecycle call recording should use selected source identity and policy facts."),
  entry("src/source/csharp-source-semantics/surfaces/js/collection-target-metadata.ts", { "target-member-helper": 2, "target-member-table": 1, "source-library-declaring-name-type": 6, "source-library-member-id-type": 3 }, "provider-metadata-candidate", "surface-provider", "Collection target metadata is isolated; next step is replacing inline target member construction with provider metadata records."),
  entry("src/source/csharp-source-semantics/surfaces/js/dictionaries.ts", { "target-member-table": 1 }, "provider-metadata-candidate", "surface-provider", "Move dictionary surface members behind provider metadata."),
  entry("src/source/csharp-source-semantics/surfaces/js/dictionary-lifecycle.ts", { "target-member-table": 1 }, "provider-metadata-candidate", "surface-provider", "Use carrier policy/provider metadata for dictionary lifecycle target members."),
  entry("src/source/csharp-source-semantics/surfaces/js/iteration.ts", { "target-member-table": 1 }, "provider-metadata-candidate", "surface-provider", "Iteration target members must come from provider metadata and iteration facts."),
  entry("src/source/csharp-source-semantics/surfaces/js/json.ts", { "source-library-member-read": 1, "source-member-id-optional-branch": 1 }, "explicit-exception-candidate", "surface-provider", "JSON stringify/parse policies must be explicit exceptions with selected source identity and provider facts."),
  entry("src/source/csharp-source-semantics/surfaces/js/objects.ts", { "target-member-helper": 2, "target-member-table": 3, "source-name-switch": 1 }, "provider-metadata-candidate", "surface-provider", "Object operations must use object-shape/provider facts and explicit exceptions."),
  entry("src/source/csharp-source-semantics/surfaces/js/policy.ts", { "target-member-table": 7, "source-library-member-id-type": 3 }, "surface-policy-candidate", "surface-provider", "Keep current concrete target member policy data cataloged while moving target mappings to provider metadata registries."),
  entry("src/source/csharp-source-semantics/surfaces/js/properties.ts", { "source-library-member-read": 2 }, "surface-policy-candidate", "surface-provider", "Property handling must consume property policy facts, not inspect source names directly."),
  entry("src/source/csharp-source-semantics/surfaces/js/property-policy.ts", { "target-member-helper": 2, "source-library-declaring-name-type": 2, "source-library-member-id-type": 5 }, "surface-policy-candidate", "surface-provider", "Convert property policy target members to provider metadata."),
  entry("src/source/csharp-source-semantics/surfaces/js/source-library.ts", { "source-library-declaring-name-type": 1, "source-library-member-id-type": 1 }, "source-identity-policy-candidate", "surface-provider", "Keep JS surface re-exports limited until source identity records replace concrete library member types."),
  entry("src/source/csharp-source-semantics/surfaces/js/unsupported.ts", {}, "surface-policy-candidate", "surface-provider", "Unsupported source-member checks must become explicit unsupported policy records with diagnostics."),
  entry("src/source/csharp-source-semantics/surfaces/nodejs/assert.ts", { "target-member-helper": 1, "export-name-switch": 1 }, "provider-metadata-candidate", "surface-provider", "Represent Node assert members as provider metadata."),
  entry("src/source/csharp-source-semantics/surfaces/nodejs/buffer/instance-members.ts", { "target-member-helper": 4 }, "provider-metadata-candidate", "surface-provider", "Represent Buffer instance members as provider metadata."),
  entry("src/source/csharp-source-semantics/surfaces/nodejs/buffer/static-members.ts", { "target-member-helper": 13 }, "provider-metadata-candidate", "surface-provider", "Represent Buffer static members as provider metadata."),
  entry("src/source/csharp-source-semantics/surfaces/nodejs/crypto.ts", { "target-member-helper": 1 }, "provider-metadata-candidate", "surface-provider", "Represent Node crypto members as provider metadata."),
  entry("src/source/csharp-source-semantics/surfaces/nodejs/filesystem.ts", { "target-member-helper": 5 }, "provider-metadata-candidate", "surface-provider", "Represent Node fs members as provider metadata."),
  entry("src/source/csharp-source-semantics/surfaces/nodejs/identity.ts", { "provider-identity-key-map": 1 }, "source-identity-policy-candidate", "surface-provider", "Keep Node provider identity key construction centralized while moving selectors to metadata indexes."),
  entry("src/source/csharp-source-semantics/surfaces/nodejs/members/entry-builders.ts", { "provider-identity-key-map": 10 }, "provider-metadata-candidate", "surface-provider", "Keep Node metadata index builders isolated until the Node provider metadata table replaces module-specific target-member helpers."),
  entry("src/source/csharp-source-semantics/surfaces/nodejs/members/metadata-index.ts", { "provider-identity-key-map": 3 }, "provider-metadata-candidate", "surface-provider", "Keep Node provider identity key construction inside the metadata index; selectors must consume the index rather than branch on module specifiers."),
  entry("src/source/csharp-source-semantics/surfaces/nodejs/members/provider-identity.ts", { "provider-identity-key-map": 3 }, "source-identity-policy-candidate", "surface-provider", "Keep Node provider identity key construction centralized while removing concrete module branches from selectors."),
  entry("src/source/csharp-source-semantics/surfaces/nodejs/members/target-identities.ts", { "provider-identity-key-map": 6 }, "provider-metadata-candidate", "surface-provider", "Replace Node target identity maps with provider metadata records including unsupported exceptions."),
  entry("src/source/csharp-source-semantics/surfaces/nodejs/os.ts", { "target-member-helper": 2 }, "provider-metadata-candidate", "surface-provider", "Represent Node os members as provider metadata."),
  entry("src/source/csharp-source-semantics/surfaces/nodejs/path.ts", { "target-member-helper": 3 }, "provider-metadata-candidate", "surface-provider", "Represent Node path members as provider metadata."),
  entry("src/source/csharp-source-semantics/surfaces/nodejs/process.ts", { "target-member-helper": 2 }, "provider-metadata-candidate", "surface-provider", "Represent Node process members as provider metadata."),
  entry("src/source/csharp-source-semantics/surfaces/nodejs/url/target-members.ts", { "target-member-helper": 3 }, "provider-metadata-candidate", "surface-provider", "Represent Node URL members as provider metadata."),
  entry("src/source/csharp-source-semantics/surfaces/nodejs/util.ts", { "target-member-helper": 1, "export-name-switch": 2 }, "provider-metadata-candidate", "surface-provider", "Represent Node util members as provider metadata."),
  entry("src/source/csharp-source-semantics/target-enrichment.ts", { "candidate-target-id-branch": 1 }, "provider-metadata-candidate", "target-provider", "Target member enrichment must index provider metadata by canonical selected member identity without ad hoc candidate id branches."),
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
