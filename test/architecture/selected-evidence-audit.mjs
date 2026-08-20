import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { maskNonCode } from "./source-code-mask.mjs";

export const selectedEvidenceClassifications = Object.freeze([
  "shared-source-semantics-query",
]);

const sourceQueryRules = Object.freeze([
  { id: "source-query.getResolvedSignature", pattern: /\bgetResolvedSignature\s*\(/gu },
  { id: "source-query.getResolvedSymbol", pattern: /\bgetResolvedSymbol\s*\(/gu },
  { id: "source-query.getResolvedSymbolOrNil", pattern: /\bgetResolvedSymbolOrNil\s*\(/gu },
  { id: "source-query.getSignatureDeclaration", pattern: /\bgetSignatureDeclaration\s*\(/gu },
  { id: "source-query.getSymbolAtLocation", pattern: /\bgetSymbolAtLocation\s*\(/gu },
  { id: "source-query.getPropertyOfType", pattern: /\bgetPropertyOfType\s*\(/gu },
  { id: "source-query.getTypeAtLocation", pattern: /\bgetTypeAtLocation\s*\(/gu },
  { id: "source-query.getTypeFromTypeNode", pattern: /\bgetTypeFromTypeNode\s*\(/gu },
]);

export const selectedEvidenceForbiddenRules = Object.freeze([
  { id: "raw-checker-container", pattern: /\.checker\b/gu },
  { id: "raw-type-shape-container", pattern: /\.typeShape\b/gu },
  { id: "raw-source-file-query-type", pattern: /\bSourceFileQueries\b/gu },
  { id: "raw-source-file-query-factory", pattern: /\bgetSourceFileQueries\b/gu },
  { id: "target-local-query-facade", pattern: /\b(?:input|host)\.queries(?:For)?\s*\(/gu },
  { id: "safe-checker-helper", pattern: /\b(?:safeGet|getSafe)(?:Type|Symbol|Resolved|Signature)[A-Za-z0-9_$]*/gu },
  { id: "raw-TypeArguments", pattern: /\bTypeArguments\b/gu },
  { id: "raw-Text", pattern: /\.Text\b/gu },
  { id: "raw-node-object-keys", pattern: /\bObject\.keys\s*\(\s*(?:node|subject|type|symbol|signature)\b/gu },
  { id: "raw-ownKeys", pattern: /\bownKeys\b/gu },
  { id: "raw-object-field-probe", pattern: /\bObject\.getOwnPropertyDescriptor\s*\(/gu },
  { id: "raw-node-field-helper", pattern: /\bgetNodeField\s*\(/gu },
  { id: "raw-node-record-probe", pattern: /\(node\s+as\s+Record<string,\s*unknown>/gu },
  { id: "raw-compiler-node-kind", pattern: /\.Kind\b/gu },
  { id: "raw-compiler-subject-field", pattern: /\.(?:Flags|Declarations|ValueDeclaration)\b/gu },
  { id: "source-usage-channel", pattern: /\b(?:sourceUsage|sourceMemberNames|TargetSourceUsageHints|collectProjectSourceUsageHints)\b/gu },
  { id: "local-method-type-argument-reconstruction", pattern: /\b(?:getSourceCallTypeParameterSubstitutions|addInferredTargetTypeParameterSubstitutions)\b/gu },
  { id: "source-marker-name-reconstruction", pattern: /\b(?:attributeBuilderChainMethods|isAttributeSelectorCallbackExpression|isAttributeBuilderExpression)\b/gu },
  { id: "target-operation-lifecycle", pattern: /\b(?:registerTargetSemanticProvider|TargetSemanticProvider|TargetOperationFact|SelectedTargetSignatureFact|deferObservation|recordCsharpCheckedOperationFactsBeforeFinalization)\b/gu },
  { id: "target-operation-fact", pattern: /\b(?:csharpRuntimeCarrierFactKey|recordCsharpRuntimeCarrierFact|csharpTargetOperationFact|surfaceTargetOperationFact)\b/gu },
  { id: "lifecycle-source-walk", pattern: /\bvisitAstReaderNodes\s*\(/gu },
  { id: "provider-signature-id-fallback", pattern: /\bproviderSourceSignatureId\b/gu },
]);

export const selectedEvidenceRiskRules = Object.freeze([
  ...sourceQueryRules,
  ...selectedEvidenceForbiddenRules,
]);

export const expectedSharedSourceQuerySites = Object.freeze(new Map());

export function buildSelectedEvidenceAuditRows(repoRoot) {
  return collectSelectedEvidenceFindings(repoRoot).map((finding) => {
    const expected = expectedSharedSourceQuerySites.get(
      findingKey(finding.file, finding.ruleId),
    );
    return {
      ...finding,
      classification: expected === undefined
        ? "forbidden-or-unclassified"
        : "shared-source-semantics-query",
      purpose: expected?.purpose ?? "Forbidden or unclassified source-semantic reconstruction.",
      action: expected === undefined
        ? "Remove or route through the shared source-semantics contract."
        : "Retain only while the exact shared query remains necessary at this target policy or translation site.",
      coverage: "selected-evidence audit exact-site and forbidden-pattern gates",
    };
  });
}

export function collectSelectedEvidenceFindings(repoRoot) {
  return sourceFiles(join(repoRoot, "src")).flatMap((filePath) => {
    const file = relative(repoRoot, filePath).split(sep).join("/");
    const text = readFileSync(filePath, "utf8");
    return collectSelectedEvidenceFindingsForSource(file, text);
  });
}

export function collectSelectedEvidenceFindingsForSource(file, text) {
  const code = maskNonCode(text);
  return selectedEvidenceRiskRules.flatMap((rule) => {
    rule.pattern.lastIndex = 0;
    return [...code.matchAll(rule.pattern)].map((match) => ({
      file,
      ruleId: rule.id,
      line: lineNumberAt(text, match.index ?? 0),
      snippet: lineAt(text, match.index ?? 0).trim(),
      enclosingSymbol: enclosingSymbolAt(text, match.index ?? 0),
    }));
  });
}

export function findingCounts(findings) {
  const counts = new Map();
  for (const finding of findings) {
    const key = findingKey(finding.file, finding.ruleId);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function findingKey(file, ruleId) {
  return `${file}::${ruleId}`;
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
  return text.slice(0, index).split("\n").length;
}

function lineAt(text, index) {
  const start = text.lastIndexOf("\n", index) + 1;
  const end = text.indexOf("\n", index);
  return text.slice(start, end === -1 ? text.length : end);
}

function enclosingSymbolAt(text, index) {
  const lines = text.slice(0, index).split("\n");
  for (let lineIndex = lines.length - 1; lineIndex >= 0; lineIndex -= 1) {
    const line = lines[lineIndex];
    const functionMatch = line.match(/^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)\b/u);
    if (functionMatch !== null) {
      return functionMatch[1];
    }
    const bindingMatch = line.match(/^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=/u);
    if (bindingMatch !== null) {
      return bindingMatch[1];
    }
  }
  return "<module>";
}
