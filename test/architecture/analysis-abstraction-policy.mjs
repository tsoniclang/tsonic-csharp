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
    pattern: /(?<!function\s)\btarget(?:Method|Property|Constructor)\s*\(/g,
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
    id: "nodejs-direct-module-resolver-map",
    pattern: /\bdirectIdentityTargetMemberResolversByModule\b/g,
    replacement:
      "Derive Node direct member resolution from canonical provider metadata rows, not a module-to-resolver function map.",
  },
  {
    id: "nodejs-target-identity-map",
    pattern: /\bnodejs(?:TargetMembersByProviderSymbolIdentity|UnsupportedTargetIdentitiesByProviderSymbol)\b/g,
    replacement:
      "Derive Node target identities and unsupported identities from the same canonical provider metadata records used for operation mapping.",
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
  entry("src/source/csharp-source-semantics/source-library.ts", { "source-member-name": 1, "source-member-id-prefix-branch": 1, "source-library-type-check": 1, "source-library-declaring-name-type": 8, "source-library-member-id-type": 7 }, "source-identity-policy-candidate", "surface-provider", "Keep source-library inspection centralized here until replaced by selected declaration identity records."),
  entry("src/source/csharp-source-semantics/source-type-classification.ts", { "source-library-type-check": 1, "source-library-declaring-name-type": 2 }, "type-classification-candidate", "target-provider", "Centralize source standard-library type names in one classification policy before generic analysis consumes category facts."),
  entry("src/source/csharp-source-semantics/surfaces/js/source-library.ts", { "source-library-declaring-name-type": 1, "source-library-member-id-type": 1 }, "source-identity-policy-candidate", "surface-provider", "Keep JS surface re-exports limited until source identity records replace concrete library member types."),
  entry("src/source/csharp-source-semantics/surfaces/js/unsupported.ts", {}, "surface-policy-candidate", "surface-provider", "Unsupported source-member checks must become explicit unsupported policy records with diagnostics."),
  entry("src/source/csharp-source-semantics/surfaces/nodejs/members/metadata-index.ts", { "nodejs-direct-module-resolver-map": 2 }, "provider-metadata-candidate", "surface-provider", "Replace the Node module-to-resolver map with canonical provider metadata rows keyed by selected declaration/member identity."),
  entry("src/source/csharp-source-semantics/surfaces/nodejs/members/target-identities.ts", { "nodejs-target-identity-map": 4 }, "provider-metadata-candidate", "surface-provider", "Derive Node target and unsupported identities from the canonical provider metadata record set."),
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
