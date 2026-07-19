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
  { id: "checker.getResolvedSymbolOrNil", pattern: /getResolvedSymbolOrNil\s*\(/g },
  { id: "checker.getSignatureDeclaration", pattern: /getSignatureDeclaration\s*\(/g },
  { id: "checker.getSymbolAtLocation", pattern: /getSymbolAtLocation\s*\(/g },
  { id: "checker.getPropertyOfType", pattern: /getPropertyOfType\s*\(/g },
  { id: "checker.getTypeAtLocation", pattern: /getTypeAtLocation\s*\(/g },
  { id: "checker.getTypeFromTypeNode", pattern: /getTypeFromTypeNode\s*\(/g },
  { id: "broad-catch-return", pattern: /catch\s*\{\s*return\s+(?:undefined|false);?\s*\}/g },
  { id: "safe-helper", pattern: /\b(?:safe|getSafe)[A-Z][A-Za-z0-9_]*/g },
  { id: "raw-TypeArguments", pattern: /\bTypeArguments\b/g },
  { id: "raw-Text", pattern: /\.Text\b/g },
  { id: "object-keys", pattern: /\bObject\.keys\s*\(/g },
  { id: "ownKeys", pattern: /\bownKeys\b/g },
  { id: "raw-object-field-probe", pattern: /Object\.getOwnPropertyDescriptor\s*\(/g },
  { id: "raw-node-field-helper", pattern: /\bgetNodeField\s*\(/g },
  { id: "raw-node-record-probe", pattern: /\(node\s+as\s+Record<string,\s*unknown>/g },
  { id: "raw-compiler-node-kind", pattern: /\.Kind\b/g },
  { id: "raw-compiler-subject-field", pattern: /\.(?:Flags|Name|Declarations|ValueDeclaration)\b/g },
  { id: "raw-semantic-subject-field", pattern: /["']flags["']\s+in\s+subject/g },
  { id: "source-usage-channel", pattern: /\b(?:sourceUsage|sourceMemberNames|TargetSourceUsageHints)\b/g },
  { id: "target-analysis-selected-call-query", pattern: /\bgetResolvedCall(?:ReturnType|ParameterDeclarations|ParameterTypes)\b/g },
  { id: "local-method-type-argument-reconstruction", pattern: /\b(?:getSourceCallTypeParameterSubstitutions|addInferredTargetTypeParameterSubstitutions)\b/g },
  { id: "source-marker-name-reconstruction", pattern: /\b(?:attributeBuilderChainMethods|isAttributeSelectorCallbackExpression|isAttributeBuilderExpression)\b/g },
  { id: "contextual-target-type-requery", pattern: /getTargetTypeRefForSubject\s*\(\s*request\.context\b/g },
  { id: "single-target-member-inference", pattern: /\b(?:selectSingleProviderIndexer|getSingleSourceIndexSignature)\b/g },
  { id: "opaque-selected-signature-field-probe", pattern: /\bsourceSelectedSignature\s+as\b/g },
  { id: "lifecycle-source-walk", pattern: /visitAstReaderNodes\s*\(/g },
  { id: "checker-forcing-operation-lifecycle", pattern: /\b(?:recordCsharpCheckedOperationFactsBeforeFinalization|recordCsharpCheckedOperatorFactsBeforeFinalization|recordCsharpRecordDictionaryElementAccessFactsBeforeFinalization)\b/g },
  { id: "operation-result-extension-subject", pattern: /\bresultType\??[^\n;]*\bExtensionFactSubject\b/g },
]);

export const selectedEvidenceFileClassifications = Object.freeze(new Map([
  ...classified(
    [
      "src/backend/planner/array-boundary-facts.ts",
      "src/backend/planner/binding-patterns.ts",
      "src/backend/planner/binding-state.ts",
      "src/backend/planner/csharp-fact-queries.ts",
      "src/backend/planner/csharp-target-operations.ts",
      "src/backend/planner/csharp-type-facts.ts",
      "src/backend/planner/csharp-type-node/index.ts",
      "src/backend/planner/csharp-type-node/type-aliases.ts",
      "src/backend/planner/expression-expected-types.ts",
      "src/backend/planner/expression-operators/operands.ts",
      "src/backend/planner/expression-source-references.ts",
      "src/backend/planner/expression-target-members/source-owned-call.ts",
      "src/backend/planner/locals.ts",
      "src/backend/planner/names.ts",
      "src/backend/planner/runtime-carriers.ts",
      "src/backend/planner/runtime-union-projections.ts",
      "src/backend/planner/semantic-callable-ownership.ts",
      "src/backend/planner/semantic-fact-reasons.ts",
      "src/backend/planner/semantic-general-ownership.ts",
      "src/backend/planner/semantic-queryable-symbols.ts",
      "src/backend/planner/source-primitive-evidence.ts",
      "src/backend/planner/statement-try.ts",
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
      "src/source/csharp-source-semantics/ast-utils/traversal.ts",
      "src/source/csharp-source-semantics/selected-target-source-signature.ts",
      "src/source/csharp-source-semantics/symbol-utils.ts",
      "src/source/csharp-source-semantics/target-member-arguments/selection.ts",
      "src/source/csharp-source-semantics/target-name-facts.ts",
      "src/source/csharp-source-semantics/target-type-resolution-facts.ts",
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
      "src/source/csharp-source-semantics/referenced-declaration-target.ts",
      "src/source/csharp-source-semantics/target-type-reference-syntax.ts",
      "src/source/csharp-source-semantics/target-type-syntax-resolution.ts",
      "src/source/csharp-source-semantics/target-type-union-syntax.ts",
      "src/source/csharp-source-semantics/object-shape-syntax/constraints.ts",
      "src/source/csharp-source-semantics/source-declaration-facts.ts",
      "src/source/csharp-source-semantics/source-profile-facts.ts",
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
      "src/source/csharp-source-semantics/checked-operator-mapping/operator-rules.ts",
      "src/source/csharp-source-semantics/object-shape-recorded-facts.ts",
      "src/source/csharp-source-semantics/object-shape-semantic/subject-type.ts",
      "src/source/csharp-source-semantics/opaque-any-diagnostics/opaque-operation.ts",
      "src/source/csharp-source-semantics/opaque-any-diagnostics/unsupported-compat.ts",
      "src/source/csharp-source-semantics/runtime-carrier-subjects.ts",
      "src/source/csharp-source-semantics/surfaces/js/array-carriers.ts",
      "src/source/csharp-source-semantics/surfaces/js/collections.ts",
      "src/source/csharp-source-semantics/surfaces/js/date/runtime-carrier.ts",
      "src/source/csharp-source-semantics/target-constraint-validation.ts",
      "src/source/csharp-source-semantics/target-type-subject-resolution.ts",
      "src/source/csharp-source-semantics/target-type-subject-resolution/callable-expression.ts",
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
      "src/source/csharp-source-semantics/object-shape-facts/semantic-subjects.ts",
      "src/source/csharp-source-semantics/object-shape-facts.ts",
      "src/source/csharp-source-semantics/object-shape-lifecycle/object-rest-binding.ts",
      "src/source/csharp-source-semantics/runtime-carrier-lifecycle/checked-expressions.ts",
      "src/source/csharp-source-semantics/runtime-carrier-lifecycle/initializer-propagation.ts",
      "src/source/csharp-source-semantics/runtime-carrier-lifecycle/referenced-facts.ts",
      "src/source/csharp-source-semantics/runtime-carrier-lifecycle/return-propagation.ts",
      "src/source/csharp-source-semantics/surfaces/js/array-carrier-lifecycle/traversal.ts",
      "src/source/csharp-source-semantics/surfaces/js/regexp/runtime-carrier.ts",
      "src/source/csharp-source-semantics/surfaces/js/json.ts",
    ],
    {
      symbol: "post-check lifecycle type and fact propagation",
      purpose: "Propagate runtime-carrier and object-shape facts from checked source types without selecting source operation identity.",
      classification: "post-check-type-only-query",
      action: "Keep as post-check type/fact materialization; operation identity must remain sourced from selected or finalized facts.",
      coverage: "selected-evidence audit, runtime-carrier/object-shape tests, and missing-selected-evidence mapper regressions.",
    },
  ),
]));

const rawAstReaderContractGapFiles = Object.freeze([
  "src/backend/planner/csharp-fact-queries.ts",
  "src/backend/planner/csharp-type-facts.ts",
  "src/backend/planner/csharp-type-node/array-types.ts",
  "src/backend/planner/csharp-type-node/function-types.ts",
  "src/backend/planner/csharp-type-node/type-aliases.ts",
  "src/backend/planner/expression-target-members/property-access.ts",
  "src/backend/planner/expression-void.ts",
  "src/backend/planner/runtime-carriers.ts",
  "src/backend/planner/semantic-source-ownership.ts",
  "src/source/csharp-source-semantics/ast-utils/expression-syntax.ts",
  "src/source/csharp-source-semantics/ast-utils/node-access.ts",
  "src/source/csharp-source-semantics/ast-utils/type-syntax.ts",
  "src/source/csharp-source-semantics/attribute-application-facts.ts",
  "src/source/csharp-source-semantics/callable-target-types.ts",
  "src/source/csharp-source-semantics/checked-assignability-validation/context-nodes.ts",
  "src/source/csharp-source-semantics/checked-assignability-validation/index.ts",
  "src/source/csharp-source-semantics/checked-assignability-validation/member-write.ts",
  "src/source/csharp-source-semantics/checked-assignability-validation/typed-boundary.ts",
  "src/source/csharp-source-semantics/object-shape-facts/binding-carriers.ts",
  "src/source/csharp-source-semantics/object-shape-lifecycle/object-rest-binding.ts",
  "src/source/csharp-source-semantics/object-shape-lifecycle/source-name.ts",
  "src/source/csharp-source-semantics/object-shape-recorded-facts.ts",
  "src/source/csharp-source-semantics/object-shape-semantic/class-constructible.ts",
  "src/source/csharp-source-semantics/object-shape-semantic/member-facts.ts",
  "src/source/csharp-source-semantics/object-shape-semantic/type-parameter-substitution.ts",
  "src/source/csharp-source-semantics/object-shape-syntax/constraints.ts",
  "src/source/csharp-source-semantics/object-shape-syntax/target-type-ref.ts",
  "src/source/csharp-source-semantics/object-shape-type-literal-facts.ts",
  "src/source/csharp-source-semantics/opaque-any-diagnostics/opaque-operation.ts",
  "src/source/csharp-source-semantics/opaque-any-diagnostics/unsupported-compat.ts",
  "src/source/csharp-source-semantics/operator-syntax.ts",
  "src/source/csharp-source-semantics/referenced-declaration-target.ts",
  "src/source/csharp-source-semantics/runtime-carrier-lifecycle/async-await.ts",
  "src/source/csharp-source-semantics/runtime-carrier-lifecycle/checked-expressions.ts",
  "src/source/csharp-source-semantics/runtime-carrier-lifecycle/conditional-expressions.ts",
  "src/source/csharp-source-semantics/runtime-carrier-lifecycle/declaration-propagation.ts",
  "src/source/csharp-source-semantics/runtime-carrier-lifecycle/expected-context-propagation.ts",
  "src/source/csharp-source-semantics/runtime-carrier-lifecycle/initializer-propagation.ts",
  "src/source/csharp-source-semantics/runtime-carrier-lifecycle/object-binding-propagation.ts",
  "src/source/csharp-source-semantics/runtime-carrier-lifecycle/referenced-facts.ts",
  "src/source/csharp-source-semantics/source-core-struct-markers/declarations.ts",
  "src/source/csharp-source-semantics/source-declaration-facts/recording.ts",
  "src/source/csharp-source-semantics/source-declaration-facts/struct-declaration.ts",
  "src/source/csharp-source-semantics/source-declaration-facts/target-type.ts",
  "src/source/csharp-source-semantics/selected-call-finalization.ts",
  "src/source/csharp-source-semantics/surfaces/js/array-carrier-lifecycle/mutation-classification.ts",
  "src/source/csharp-source-semantics/surfaces/js/array-carrier-lifecycle/traversal.ts",
  "src/source/csharp-source-semantics/surfaces/js/date/runtime-carrier.ts",
  "src/source/csharp-source-semantics/surfaces/js/json.ts",
  "src/source/csharp-source-semantics/surfaces/js/regexp/runtime-carrier.ts",
  "src/source/csharp-source-semantics/symbol-utils.ts",
  "src/source/csharp-source-semantics/target-constraint-validation.ts",
  "src/source/csharp-source-semantics/target-member-arguments/type-matching.ts",
  "src/source/csharp-source-semantics/target-member-literals.ts",
  "src/source/csharp-source-semantics/target-type-checked-expression-syntax.ts",
  "src/source/csharp-source-semantics/target-type-constructed-expression-syntax.ts",
  "src/source/csharp-source-semantics/target-type-function-signatures.ts",
  "src/source/csharp-source-semantics/target-type-literal-syntax.ts",
  "src/source/csharp-source-semantics/target-type-reference-syntax.ts",
  "src/source/csharp-source-semantics/target-type-resolution-facts.ts",
  "src/source/csharp-source-semantics/target-type-subject-facts.ts",
  "src/source/csharp-source-semantics/target-type-syntax-resolution.ts",
  "src/source/csharp-source-semantics/target-type-union-syntax.ts",
]);

const rawCompilerNodeKindGapFiles = Object.freeze([
  "src/backend/planner/csharp-type-facts.ts",
  "src/backend/planner/destructuring-assignment.ts",
  "src/backend/planner/diagnostics.ts",
  "src/backend/planner/expression-binary-operands.ts",
  "src/backend/planner/expression-unary-operators.ts",
  "src/backend/planner/names.ts",
  "src/backend/planner/source-ast-kinds.ts",
  "src/source/csharp-source-semantics/checked-assignability-validation/context-nodes.ts",
  "src/source/csharp-source-semantics/symbol-utils.ts",
  "src/source/fact-subjects.ts",
]);

export const selectedEvidenceFindingClassifications = Object.freeze(new Map([
  ...classifiedFindings(
    rawAstReaderContractGapFiles,
    ["raw-node-field-helper"],
    {
      symbol: "public AST structural accessor gap",
      purpose: "Read already-parsed structural child slots through the remaining centralized raw-node adapter.",
      classification: "tsts-contract-gap",
      action: "Replace with public AstReader structural accessors and delete getNodeField; tracked by .analysis/tsts-issues/20260710-011200-public-ast-reader-structural-accessor-gap.md.",
      coverage: "Every current getNodeField occurrence is enumerated here; new files fail the selected-evidence inventory gate.",
    },
  ),
  ...classifiedFindings(
    rawCompilerNodeKindGapFiles,
    ["raw-compiler-node-kind"],
    {
      symbol: "public compiler subject/node kind gap",
      purpose: "Classify opaque compiler subjects or legacy backend syntax through raw TS-Go Kind fields.",
      classification: "tsts-contract-gap",
      action: "Replace opaque-subject checks with public subjectKind and syntax checks with AstReader.kind/kindName; no new raw Kind reads are allowed.",
      coverage: "Every current raw Kind occurrence is enumerated here; subject classification is tracked by .analysis/tsts-issues/20260710-013000-public-fact-subject-kind-and-alias-queries.md.",
    },
  ),
  ...classifiedFindings(
    [
      "src/source/csharp-source-semantics/checked-assignability-validation/context-nodes.ts",
      "src/source/fact-subjects.ts",
    ],
    ["raw-semantic-subject-field"],
    {
      symbol: "public semantic fact-subject discriminator gap",
      purpose: "Distinguish an opaque semantic Type subject from nodes, symbols, signatures, and target facts.",
      classification: "tsts-contract-gap",
      action: "Replace raw flags-shape inspection with a public TSTS fact-subject kind query.",
      coverage: "Selected-evidence inventory plus .analysis/tsts-issues/20260710-013000-public-fact-subject-kind-and-alias-queries.md.",
    },
  ),
  ...classifiedFindings(
    [
      "src/backend/planner/array-boundary-facts.ts",
      "src/backend/planner/csharp-fact-queries.ts",
      "src/backend/planner/csharp-type-node/array-types.ts",
      "src/backend/planner/csharp-type-node/function-types.ts",
      "src/backend/planner/csharp-type-node/type-aliases.ts",
      "src/backend/planner/expression-target-members/property-access.ts",
      "src/backend/planner/locals.ts",
      "src/backend/planner/runtime-carriers.ts",
      "src/source/csharp-source-semantics/ast-utils/node-access.ts",
    ],
    ["raw-object-field-probe", "raw-node-record-probe"],
    {
      symbol: "public AST accessor gap",
      purpose: "Read structural AST fields for already-checked syntax where the public TSTS AstReader exposes no corresponding accessor.",
      classification: "tsts-contract-gap",
      action: "Replace with public AstReader accessors; raw TS-Go object field probing is not an accepted final path.",
      coverage: "selected-evidence scanner and a dedicated neutral TSTS AstReader contract issue.",
    },
  ),
  ...classifiedFindings(
    ["src/source/csharp-source-semantics/symbol-utils.ts"],
    ["raw-compiler-subject-field"],
    {
      symbol: "public fact-subject discriminator gap",
      purpose: "Distinguish an opaque ExtensionFactSubject symbol before calling public symbol query APIs.",
      classification: "tsts-contract-gap",
      action: "Replace with a public TSTS subject-kind/symbol-alias query; raw Symbol Flags/Name checks are not an accepted final path.",
      coverage: "selected-evidence scanner plus .analysis/tsts-issues/20260710-013000-public-fact-subject-kind-and-alias-queries.md.",
    },
  ),
]));

export function buildSelectedEvidenceAuditRows(repoRoot) {
  const findings = collectSelectedEvidenceFindings(repoRoot);
  return findings.map((finding) => {
    const classification = selectedEvidenceFindingClassifications.get(findingKey(finding.file, finding.ruleId)) ??
      selectedEvidenceFileClassifications.get(finding.file);
    const resolvedClassification = classification ?? missingClassification(finding.file);
    return {
      ...finding,
      ...resolvedClassification,
      symbol: `${finding.enclosingSymbol} (${resolvedClassification.symbol})`,
    };
  });
}

export function collectSelectedEvidenceFindings(repoRoot) {
  return selectedEvidenceSourceFiles(repoRoot).flatMap((filePath) => {
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

export function selectedEvidenceAuditedFiles() {
  return [...new Set([
    ...selectedEvidenceFileClassifications.keys(),
    ...[...selectedEvidenceFindingClassifications.keys()].map((key) => key.slice(0, key.lastIndexOf("::"))),
  ])].sort();
}

function classified(files, classification) {
  return files.map((file) => [file, Object.freeze(classification)]);
}

function classifiedFindings(files, ruleIds, classification) {
  return files.flatMap((file) => ruleIds.map((ruleId) => [findingKey(file, ruleId), Object.freeze(classification)]));
}

function findingKey(file, ruleId) {
  return `${file}::${ruleId}`;
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
  ].flatMap((directory) => sourceFiles(join(repoRoot, directory)))
    .concat(join(repoRoot, "src/source/fact-subjects.ts"));
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

function maskNonCode(text) {
  const output = text.split("");
  const stack = [{ kind: "code", templateExpression: false, braceDepth: 0 }];
  const mask = (index) => {
    if (output[index] !== "\n" && output[index] !== "\r") {
      output[index] = " ";
    }
  };
  for (let index = 0; index < text.length; index += 1) {
    const frame = stack[stack.length - 1];
    const character = text[index];
    const next = text[index + 1];
    if (frame.kind === "line-comment") {
      if (character === "\n") {
        stack.pop();
      } else {
        mask(index);
      }
      continue;
    }
    if (frame.kind === "block-comment") {
      mask(index);
      if (character === "*" && next === "/") {
        mask(index + 1);
        index += 1;
        stack.pop();
      }
      continue;
    }
    if (frame.kind === "quote") {
      mask(index);
      if (character === "\\") {
        mask(index + 1);
        index += 1;
      } else if (character === frame.delimiter) {
        stack.pop();
      }
      continue;
    }
    if (frame.kind === "template") {
      mask(index);
      if (character === "\\") {
        mask(index + 1);
        index += 1;
      } else if (character === "`") {
        stack.pop();
      } else if (character === "$" && next === "{") {
        mask(index + 1);
        index += 1;
        stack.push({ kind: "code", templateExpression: true, braceDepth: 0 });
      }
      continue;
    }
    if (frame.templateExpression && character === "}") {
      if (frame.braceDepth === 0) {
        mask(index);
        stack.pop();
      } else {
        frame.braceDepth -= 1;
      }
      continue;
    }
    if (frame.templateExpression && character === "{") {
      frame.braceDepth += 1;
      continue;
    }
    if (character === "/" && next === "/") {
      mask(index);
      mask(index + 1);
      index += 1;
      stack.push({ kind: "line-comment" });
    } else if (character === "/" && next === "*") {
      mask(index);
      mask(index + 1);
      index += 1;
      stack.push({ kind: "block-comment" });
    } else if (character === "'" || character === '"') {
      mask(index);
      stack.push({ kind: "quote", delimiter: character });
    } else if (character === "`") {
      mask(index);
      stack.push({ kind: "template" });
    }
  }
  return output.join("");
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
