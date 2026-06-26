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
    id: "source-member-id-map-dispatch",
    pattern: /\b[A-Za-z_$][\w$]*(?:BySource(?:Identity|Member|Id)?|ByIdentity|BySourceMember|RequirementRows|Requirements|Policies|Policy|Providers|Resolvers|Rows|Index|Map|Members|TargetMembers|TargetMember)?\.(?:get|has)\s*\(\s*sourceMember\.id\s*\)/g,
    allowedFilePattern: sourceIdentityMetadataFilePattern(),
    replacement:
      "Do not dispatch operations, carriers, policies, or target members by sourceMember.id Map lookups; consume selected declaration/signature identity through generic metadata selectors.",
  },
  {
    id: "source-member-id-set-table-definition",
    pattern: /\b(?:sourceMemberIdSet|sourceLibraryMemberIdSet)\s*\(\s*(?:\[|[A-Za-z_$][\w$]*)/g,
    allowedFilePattern: sourceIdentityMetadataFilePattern(),
    replacement:
      "Source member id sets belong only in pure source identity metadata modules; analysis, carrier, and target policy tables must use generic metadata facts.",
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
    id: "callee-property-source-name-filter",
    pattern: /candidate\.sourceName\s*===\s*request\.calleePropertyName/g,
    replacement:
      "Provider receiver call mapping must use selected declaration/signature identity, not callee property spelling.",
  },
  {
    id: "synthesized-native-array-target-member",
    pattern: /createDotnetNativeArrayTargetMember|__tsonic_native_array_create/g,
    replacement:
      "Native array creation members must come from provider metadata; missing provider metadata is a diagnostic.",
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
    id: "source-library-member-ad-hoc-match",
    pattern: /(?<!function\s)\bsourceLibraryMemberMatchesAny(?:Prefix)?\s*\(/g,
    replacement:
      "Route concrete source member ids through named SourceLibraryMemberIdentityPolicy records before generic matching.",
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
    id: "nodejs-direct-target-member-identity-map",
    pattern: /\bnode[A-Za-z0-9]+TargetMembersByIdentity\b/g,
    replacement:
      "Use the canonical Node provider metadata index instead of per-module target-member identity maps.",
  },
  {
    id: "source-family-call-provider-registry",
    pattern: /\b(?:csharpJsSourceLibraryProviders|providerForSourceMember|simpleCallProvider)\b/g,
    replacement:
      "Replace source-family call-provider registries with source identity policy data plus generic provider/runtime metadata selectors.",
  },
  {
    id: "source-family-closed-facts-validator",
    pattern: /\b(?:jsonClosedFactsValidators|objectClosedFactsValidators|callClosedReceiverPolicies)\b/g,
    replacement:
      "Closed-fact validation must consume generic lazy analysis records and provider facts, not source-family validator tables.",
  },
  {
    id: "executable-surface-member-template",
    pattern: /\bcreateMembers\s*:\s*\(/g,
    replacement:
      "Surface member definitions must be provider/runtime metadata records or explicit exception records, not executable per-member templates.",
  },
  {
    id: "array-specific-use-classifier",
    pattern: /\b(?:ArrayUse|collectArrayUsesForSymbol|classifyIdentifierArrayUse|classifySourceLibraryArrayPropertyUse|classifySourceLibraryStaticCallArgumentUse)\b/g,
    replacement:
      "Use lazy generic analysis services for references, property writes, element writes, calls, captures, escapes, and mutations; array carrier planning consumes those structural records.",
  },
  {
    id: "source-member-name-to-target-lookup",
    pattern: /\b[A-Za-z0-9]*(?:TargetMember|TargetMembers|PropertyTargetMember)s?ForSourceName\s*\(\s*sourceLibraryMemberName\s*\(\s*sourceMember\s*\)/g,
    replacement:
      "Do not convert selected source member names into target member lookups; provider/runtime metadata rows must prove the target operation.",
  },
  {
    id: "source-name-target-member-helper-api",
    pattern: /\b(?:jsSurface(?:Single)?TargetMembers?ForSourceName|[A-Za-z0-9]+(?:TargetMember|TargetMembers|PropertyTargetMember)s?ForSourceName)\b/g,
    replacement:
      "Replace source-name target-member helper APIs with selected source declaration/signature identity indexes.",
  },
  {
    id: "source-library-member-name-call",
    pattern: /(?<!function\s)\bsourceLibraryMemberName\s*\(/g,
    replacement:
      "Do not derive operation semantics from a selected member's spelling; use source identity records and provider metadata indexes.",
  },
  {
    id: "source-id-executable-policy-hook",
    pattern: /(?:^|[{,]\s*)\b(?:uses|validate|resolve|result|requiresClosedReceiver|mapCall)\s*:\s*(?:(?:\([^\n)]*\)|[A-Za-z_$][\w$]*)\s*=>|function\b|[A-Za-z_$][\w$]*(?=\s*[,}]))/gm,
    replacement:
      "Source-identity policy tables must be declarative metadata or explicit exception records, not executable semantic hooks.",
  },
  {
    id: "source-id-analysis-table-definition",
    pattern: /\b(?:const|export\s+const)\s+(?:sourceCallPolicyRecords|closedReceiverRequirementPolicies|closedFactRules|propertyReceiverValidatorPolicies|arrayPropertyUseRules|staticCallArgumentUseRules|propertyMemberResolvers|propertyMemberProviders|propertyPrecheckRules)\b/g,
    replacement:
      "Source-id analysis tables are migration debt until they are pure declarative metadata consumed by generic selectors.",
  },
  {
    id: "source-id-analysis-table-lookup",
    pattern: /\b(?:sourceCallPolicyRecords|closedFactRules|arrayPropertyUseRules|staticCallArgumentUseRules|propertyMemberResolvers|propertyMemberProviders|propertyPrecheckRules|propertyReceiverValidatorPolicies)\.(?:find|some)\s*\([^\n]*(?:sourceMember|sourceLibraryMemberMatches)/g,
    replacement:
      "Source-id table dispatch must become generic selector lookup over selected declaration/signature identity and metadata rows.",
  },
  {
    id: "procedural-source-member-table-dispatch",
    pattern: /\b[A-Za-z_$][\w$]*(?:Policies|PolicyRows|Rules|Rows|Records|Providers|Resolvers|Requirements|RequirementRows|MemberPolicies|CallPolicies)\.(?:find|some)\s*\([\s\S]{0,240}?\b(?:sourceMember|sourceLibraryMemberMatches)\b/g,
    replacement:
      "Policy/table dispatch over sourceMember must become a generic selector lookup over selected declaration/signature identity and declarative metadata rows.",
  },
  {
    id: "dynamic-target-member-from-source-member",
    pattern: /\bjsSurfaceTargetMemberFromMetadata\s*\(\s*\{[\s\S]{0,500}?\bsourceLibraryMember(?:Name|Identity)\s*\(\s*sourceMember\s*\)/g,
    replacement:
      "Target members must come from provider/runtime metadata rows with declared semantic equivalence, not be synthesized from a source member at selection time.",
  },
  {
    id: "target-member-source-name-synthesis",
    pattern: /\b(?:targetName\s*:\s*(?:sourceName|sourceMember\.memberName|sourceLibraryMemberName\s*\(\s*sourceMember\s*\))|id\s*:\s*`[^`]*\$\{\s*(?:sourceName|sourceMember\.id|sourceLibraryMemberIdentity\s*\(\s*sourceMember\s*\))\s*\})/g,
    replacement:
      "Target member names and ids must be declared by provider/runtime metadata rows, not synthesized from source member names or identities.",
  },
  {
    id: "node-local-export-signature-selection",
    pattern: /\.find\s*\(\s*\(?\s*entry\s*\)?\s*=>\s*entry\.(?:exportName|signatureId)\s*===/g,
    replacement:
      "Node provider member selection must use canonical declaration/signature identity indexes rather than local export/signature search.",
  },
  {
    id: "semantic-fallback-word",
    pattern: /\bfallback\b/gi,
    replacement:
      "Classify as harmless syntax fallback or replace semantic fallback with fail-closed diagnostics.",
  },
]);

export const analysisAbstractionFileRules = Object.freeze([
  {
    id: "procedural-policy-file",
    pattern: /(?:^|\/)(?:policy|selection-policy|property-policy|array-use-policy)\.ts$/,
    replacement:
      "Use named source-identity, rule, provider-metadata, selector, closed-fact, or exception modules; do not reintroduce procedural policy catch-alls.",
  },
  {
    id: "array-specific-use-classifier-file",
    pattern: /(?:^|\/)surfaces\/js\/array-carrier-lifecycle\/use-classification\.ts$/,
    replacement:
      "Move source-use discovery into the generic lazy analysis layer; array lifecycle planning must consume structural analysis records.",
  },
  {
    id: "collection-target-metadata-executable-policy-file",
    pattern: /(?:^|\/)collection-target-metadata\/[^/]+-policy\.ts$/,
    contentPattern: /\b(?:createOpenType|createClosedType|isTargetType|getIterableElementType)\s*:\s*(?:(?:\([^)\n]*\)|[A-Za-z_$][\w$]*)\s*=>|[A-Za-z_$][\w$]*(?=\s*[,}]))/g,
    replacement:
      "Collection target metadata policy files must be pure metadata rows; executable selectors belong in generic provider/runtime selector implementations.",
  },
  {
    id: "provider-metadata-executable-selector-file",
    pattern: /(?:^|\/)provider-metadata\/[^/]+\.ts$/,
    contentPattern: /\b(?:uses|validate|resolve|result|requiresClosedReceiver|mapCall)\s*:\s*(?:(?:\([^)\n]*\)|[A-Za-z_$][\w$]*)\s*=>|function\b|[A-Za-z_$][\w$]*(?=\s*[,}]))|\.(?:find|some)\s*\([\s\S]{0,240}\bsourceMember\b/g,
    replacement:
      "Provider metadata files must contain declarative rows only; executable source-member selectors belong in generic selector modules.",
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

export const analysisAbstractionDebtCatalog = Object.freeze([]);

export function collectAnalysisAbstractionFindings(repoRoot) {
  return sourceFiles(join(repoRoot, "src")).flatMap((filePath) => {
    const file = relative(repoRoot, filePath).split(sep).join("/");
    const text = readFileSync(filePath, "utf8");
    return collectAnalysisAbstractionFindingsForSource(file, text);
  });
}

export function collectAnalysisAbstractionFindingsForSource(file, text) {
  return [
    ...analysisAbstractionFileRules.flatMap((rule) => collectFileRuleFindings(file, text, rule)),
    ...analysisAbstractionRules.flatMap((rule) => collectRuleFindings(file, text, rule)),
  ];
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
  if (!ruleAppliesToFile(rule, file)) {
    return [];
  }
  rule.pattern.lastIndex = 0;
  return [...text.matchAll(rule.pattern)].map((match) => ({
    file,
    ruleId: rule.id,
    line: lineNumberAt(text, match.index ?? 0),
    snippet: lineAt(text, match.index ?? 0).trim(),
    replacement: rule.replacement,
  }));
}

function collectFileRuleFindings(file, text, rule) {
  rule.pattern.lastIndex = 0;
  if (!rule.pattern.test(file)) {
    return [];
  }
  if (rule.contentPattern === undefined) {
    return [{
        file,
        ruleId: rule.id,
        line: 1,
        snippet: file,
        replacement: rule.replacement,
      }];
  }
  rule.contentPattern.lastIndex = 0;
  return [...text.matchAll(rule.contentPattern)].map((match) => ({
    file,
    ruleId: rule.id,
    line: lineNumberAt(text, match.index ?? 0),
    snippet: lineAt(text, match.index ?? 0).trim(),
    replacement: rule.replacement,
  }));
}

function ruleAppliesToFile(rule, file) {
  if (rule.filePattern !== undefined) {
    rule.filePattern.lastIndex = 0;
    if (!rule.filePattern.test(file)) {
      return false;
    }
  }
  if (rule.allowedFilePattern !== undefined) {
    rule.allowedFilePattern.lastIndex = 0;
    if (rule.allowedFilePattern.test(file)) {
      return false;
    }
  }
  return true;
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

function sourceIdentityMetadataFilePattern() {
  return /(?:^|\/)(?:source-identities\/[^/]+|source-library|source-identit(?:y|ies)|identities|identity-policies)\.ts$/;
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
