import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

export const selectedEvidenceClassifications = Object.freeze([
  "selected-evidence-compliant",
  "post-check-type-only-query",
  "provider-declaration-production",
  "wrong-abstraction-reworked",
  "tsts-contract-gap",
  "lifecycle-ordering-bug",
]);

export const selectedEvidenceRiskRules = Object.freeze([
  { id: "checker.getResolvedSignature", pattern: /getResolvedSignature\s*\(/g },
  { id: "checker.getResolvedSymbol", pattern: /getResolvedSymbol\s*\(/g },
  { id: "checker.getSymbolAtLocation", pattern: /getSymbolAtLocation\s*\(/g },
  { id: "checker.getPropertyOfType", pattern: /getPropertyOfType\s*\(/g },
  { id: "checker.getTypeAtLocation", pattern: /getTypeAtLocation\s*\(/g },
  { id: "checker.getTypeFromTypeNode", pattern: /getTypeFromTypeNode\s*\(/g },
  { id: "broad-catch-return", pattern: /catch\s*\{\s*return\s+(?:undefined|false);?\s*\}/g },
  { id: "safe-helper", pattern: /\bsafeGet[A-Za-z0-9_]*/g },
  { id: "raw-TypeArguments", pattern: /\bTypeArguments\b/g },
  { id: "raw-Text", pattern: /\.Text\b/g },
  { id: "object-keys", pattern: /\bObject\.keys\s*\(/g },
  { id: "ownKeys", pattern: /\bownKeys\b/g },
  { id: "source-usage-channel", pattern: /\b(?:sourceUsage|sourceMemberNames|TargetSourceUsageHints)\b/g },
]);

export const selectedEvidenceFileClassifications = Object.freeze(new Map([
  ...classified(
    [
      "src/backend/planner/array-boundary-facts.ts",
      "src/backend/planner/binding-object-source-patterns.ts",
      "src/backend/planner/binding-patterns.ts",
      "src/backend/planner/binding-state.ts",
      "src/backend/planner/csharp-fact-queries.ts",
      "src/backend/planner/csharp-target-operations.ts",
      "src/backend/planner/csharp-type-expression.ts",
      "src/backend/planner/csharp-type-facts.ts",
      "src/backend/planner/csharp-type-node/index.ts",
      "src/backend/planner/csharp-type-node/type-aliases.ts",
      "src/backend/planner/expression-expected-types.ts",
      "src/backend/planner/expression-operators/operands.ts",
      "src/backend/planner/expression-source-references.ts",
      "src/backend/planner/expression-target-members/element-access.ts",
      "src/backend/planner/expression-target-members/source-owned-call.ts",
      "src/backend/planner/locals.ts",
      "src/backend/planner/names.ts",
      "src/backend/planner/runtime-carriers.ts",
      "src/backend/planner/runtime-union-projections.ts",
      "src/backend/planner/semantic-callable-ownership.ts",
      "src/backend/planner/semantic-fact-reasons.ts",
      "src/backend/planner/semantic-general-ownership.ts",
      "src/backend/planner/semantic-queryable-symbols.ts",
      "src/backend/planner/source-ast-nodes.ts",
      "src/backend/planner/source-ast-types.ts",
      "src/backend/planner/source-primitive-evidence.ts",
    ],
    {
      symbol: "backend planner semantic fact consumption",
      purpose: "Render already-checked source and finalized target facts into C# AST/source project artifacts.",
      classification: "post-check-type-only-query",
      action: "Allowed only after semantic checking; does not select source call/property/member identity.",
      coverage: "selected-evidence-audit file coverage plus backend no-fallback and generated-output scanners.",
    },
  ),
  ...classified(
    [
      "src/providers/dotnet/model-contract.ts",
      "src/providers/dotnet/reflection/tool/worker.ts",
    ],
    {
      symbol: "provider model contract validator",
      purpose: "Validate reflected/provider declaration models before TSTS declaration production.",
      classification: "provider-declaration-production",
      action: "Allowed provider input validation; does not filter declarations by source usage.",
      coverage: "dotnet provider contract tests and selected-evidence-audit file coverage.",
    },
  ),
  ...classified(
    [
      "src/source/csharp-source-semantics/ast-utils/node-access.ts",
      "src/source/csharp-source-semantics/selected-target-source-signature.ts",
      "src/source/csharp-source-semantics/source-primitive-evidence.ts",
      "src/source/csharp-source-semantics/symbol-utils.ts",
      "src/source/csharp-source-semantics/target-member-arguments/selection.ts",
      "src/source/csharp-source-semantics/target-name-facts.ts",
      "src/source/csharp-source-semantics/target-type-resolution-facts.ts",
      "src/source/csharp-source-semantics/tuple-element-index.ts",
    ],
    {
      symbol: "selected/finalized target fact helpers",
      purpose: "Consume TSTS-selected evidence, provider virtual facts, or finalized C# target facts.",
      classification: "selected-evidence-compliant",
      action: "Keep; acceptance remains tied to selected/finalized evidence and must fail closed when evidence is absent.",
      coverage: "provider-selection, source-profile, and selected-evidence-audit tests.",
    },
  ),
  ...classified(
    [
      "src/source/csharp-source-semantics/source-core-struct-markers/declarations.ts",
      "src/source/csharp-source-semantics/source-core-struct-markers/symbols.ts",
      "src/source/csharp-source-semantics/source-declaration-facts/recording.ts",
      "src/source/csharp-source-semantics/source-declaration-facts/struct-declaration.ts",
      "src/source/csharp-source-semantics/source-declaration-facts/target-type.ts",
      "src/source/csharp-source-semantics/source-marker-selectors.ts",
      "src/source/csharp-source-semantics/provider-target-binding-facts.ts",
      "src/source/csharp-source-semantics/referenced-declaration-target.ts",
      "src/source/csharp-source-semantics/target-type-reference-syntax.ts",
      "src/source/csharp-source-semantics/target-type-syntax-resolution.ts",
      "src/source/csharp-source-semantics/target-type-union-syntax.ts",
    ],
    {
      symbol: "source/provider declaration fact production",
      purpose: "Attach C# facts to explicit source-core/profile/provider declaration subjects.",
      classification: "provider-declaration-production",
      action: "Allowed only for declaration/source-profile fact production; no source-use filtering or selected operation reconstruction.",
      coverage: "source-profile/source-marker/provider-selection tests plus selected-evidence-audit file coverage.",
    },
  ),
  ...classified(
    [
      "src/source/csharp-source-semantics/checked-call-mapping/index.ts",
      "src/source/csharp-source-semantics/checked-call-request-context.ts",
      "src/source/csharp-source-semantics/checked-member-access-mapping/element-indexer-facts.ts",
      "src/source/csharp-source-semantics/checked-member-access-request-context.ts",
      "src/source/csharp-source-semantics/checked-native-mapping.ts",
      "src/source/csharp-source-semantics/checked-operator-mapping/operands.ts",
      "src/source/csharp-source-semantics/checked-operator-mapping/operator-rules.ts",
      "src/source/csharp-source-semantics/checked-operator-mapping/typeof.ts",
      "src/source/csharp-source-semantics/compat-runtime-checked-operations.ts",
      "src/source/csharp-source-semantics/native-array-lifecycle.ts",
      "src/source/csharp-source-semantics/object-shape-recorded-facts.ts",
      "src/source/csharp-source-semantics/object-shape-semantic/member-facts.ts",
      "src/source/csharp-source-semantics/object-shape-semantic/subject-type.ts",
      "src/source/csharp-source-semantics/opaque-any-diagnostics/opaque-operation.ts",
      "src/source/csharp-source-semantics/opaque-any-diagnostics/standard-library-exceptions.ts",
      "src/source/csharp-source-semantics/opaque-any-diagnostics/unsupported-compat.ts",
      "src/source/csharp-source-semantics/operation-selection/iteration.ts",
      "src/source/csharp-source-semantics/runtime-carrier-subjects.ts",
      "src/source/csharp-source-semantics/surfaces/js/array-carriers.ts",
      "src/source/csharp-source-semantics/surfaces/js/calls/member-providers/operation-requirements.ts",
      "src/source/csharp-source-semantics/surfaces/js/collections.ts",
      "src/source/csharp-source-semantics/surfaces/js/date/runtime-carrier.ts",
      "src/source/csharp-source-semantics/surfaces/js/iteration.ts",
      "src/source/csharp-source-semantics/target-constraint-validation.ts",
      "src/source/csharp-source-semantics/target-type-semantic-resolution.ts",
      "src/source/csharp-source-semantics/target-type-subject-resolution.ts",
      "src/source/csharp-source-semantics/target-type-subject-resolution/callable-expression.ts",
      "src/source/csharp-source-semantics/target-type-subject-resolution/source-member-type-parameters.ts",
    ],
    {
      symbol: "checked source type/fact analysis",
      purpose: "Resolve target type/fact evidence from checked source types after TSTS has already selected operations.",
      classification: "post-check-type-only-query",
      action: "Allowed only for type/fact materialization; selected operation identity must still come from TSTS request/fact evidence.",
      coverage: "selected-evidence-audit file coverage plus source-profile/provider-selection focused gates.",
    },
  ),
  ...classified(
    [
      "src/source/csharp-source-semantics/checked-operation-lifecycle.ts",
      "src/source/csharp-source-semantics/checked-operator-lifecycle.ts",
      "src/source/csharp-source-semantics/object-shape-facts/semantic-subjects.ts",
      "src/source/csharp-source-semantics/object-shape-lifecycle/object-rest-binding.ts",
      "src/source/csharp-source-semantics/object-shape-lifecycle/property-access.ts",
      "src/source/csharp-source-semantics/runtime-carrier-lifecycle/checked-expressions.ts",
      "src/source/csharp-source-semantics/runtime-carrier-lifecycle/initializer-propagation.ts",
      "src/source/csharp-source-semantics/runtime-carrier-lifecycle/referenced-facts.ts",
      "src/source/csharp-source-semantics/runtime-carrier-lifecycle/return-propagation.ts",
      "src/source/csharp-source-semantics/surfaces/js/array-boundary-facts.ts",
      "src/source/csharp-source-semantics/surfaces/js/array-carrier-lifecycle/traversal.ts",
      "src/source/csharp-source-semantics/surfaces/js/array-mutations.ts",
      "src/source/csharp-source-semantics/surfaces/js/dictionary-lifecycle.ts",
      "src/source/csharp-source-semantics/surfaces/js/regexp/runtime-carrier.ts",
    ],
    {
      symbol: "lifecycle fact propagation",
      purpose: "Propagate existing runtime-carrier/object-shape/operation facts after source checking.",
      classification: "lifecycle-ordering-bug",
      action: "Keep only as fact propagation; if a path needs selected operation identity, replace with request/fact evidence rather than checker rediscovery.",
      coverage: "selected-evidence-audit file coverage; missing selected evidence regression coverage for mapper entrypoints.",
    },
  ),
  ...classified(
    [
    ],
    {
      symbol: "recordCsharpJsArrayElementAccessFact",
      purpose: "Finalize JS array element operations from selected element evidence and finalized carrier facts.",
      classification: "tsts-contract-gap",
      action: "Local checker receiver re-query removed; remaining element source identity must come from TSTS selected element evidence before broader proof work continues.",
      coverage: "selected-evidence-audit file coverage and JS element missing-evidence regression.",
    },
  ),
]));

export function buildSelectedEvidenceAuditRows(repoRoot) {
  const findings = collectSelectedEvidenceFindings(repoRoot);
  return findings.map((finding) => {
    const classification = selectedEvidenceFileClassifications.get(finding.file);
    return {
      ...finding,
      ...(classification ?? missingClassification(finding.file)),
    };
  });
}

export function collectSelectedEvidenceFindings(repoRoot) {
  return selectedEvidenceSourceFiles(repoRoot).flatMap((filePath) => {
    const file = relative(repoRoot, filePath).split(sep).join("/");
    const text = readFileSync(filePath, "utf8");
    return selectedEvidenceRiskRules.flatMap((rule) => {
      rule.pattern.lastIndex = 0;
      return [...text.matchAll(rule.pattern)].map((match) => ({
        file,
        ruleId: rule.id,
        line: lineNumberAt(text, match.index ?? 0),
        snippet: lineAt(text, match.index ?? 0).trim(),
      }));
    });
  });
}

export function selectedEvidenceAuditedFiles() {
  return [...selectedEvidenceFileClassifications.keys()].sort();
}

function classified(files, classification) {
  return files.map((file) => [file, Object.freeze(classification)]);
}

function missingClassification(file) {
  return {
    symbol: "unclassified",
    purpose: "Unclassified selected-evidence risk-pattern match.",
    classification: "wrong-abstraction-reworked",
    action: `Classify ${file} before merging.`,
    coverage: "missing selected-evidence audit classification",
  };
}

function selectedEvidenceSourceFiles(repoRoot) {
  return [
    "src/source/csharp-source-semantics",
    "src/backend",
    "src/providers",
  ].flatMap((directory) => sourceFiles(join(repoRoot, directory)));
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
