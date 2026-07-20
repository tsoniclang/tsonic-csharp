import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import {
  buildSelectedEvidenceAuditRows,
  collectSelectedEvidenceFindingsForSource,
  collectSelectedEvidenceFindings,
  selectedEvidenceAuditedFiles,
  selectedEvidenceClassifications,
  selectedEvidenceFileClassifications,
} from "./architecture/selected-evidence-audit.mjs";

const repoRoot = new URL("..", import.meta.url).pathname;
const classificationSet = new Set(selectedEvidenceClassifications);

test("selected-evidence scanner distinguishes compiler fields from non-code text", () => {
  const findings = collectSelectedEvidenceFindingsForSource("src/example.ts", [
    "",
    "const raw = node.Text;",
    'const namespaceName = "System.Text.Json";',
    "const template = `System.Text.Json ${node.Text}`;",
    "// ignored.Text",
    "/* ignored.Text */",
  ].join("\n"));
  assert.deepEqual(findings.map(({ ruleId, line }) => ({ ruleId, line })), [
    { ruleId: "raw-Text", line: 2 },
    { ruleId: "raw-Text", line: 4 },
  ]);
});

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

test("selected-evidence audit rejects silent semantic recovery mechanisms", () => {
  const forbiddenRuleIds = new Set([
    "safe-helper",
    "source-usage-channel",
    "checker-forcing-operation-lifecycle",
    "raw-TypeArguments",
    "raw-Text",
    "target-analysis-selected-call-query",
    "local-method-type-argument-reconstruction",
    "source-marker-name-reconstruction",
    "contextual-target-type-requery",
    "single-target-member-inference",
  ]);
  const forbidden = buildSelectedEvidenceAuditRows(repoRoot)
    .filter((row) =>
      forbiddenRuleIds.has(row.ruleId) ||
      (row.ruleId === "broad-catch-return" && (
        row.file.startsWith("src/source/csharp-source-semantics/") ||
        row.file.startsWith("src/backend/")
      )))
    .map((row) => `${row.file}:${row.line}: ${row.ruleId}: ${row.snippet}`);
  assert.deepEqual(forbidden, []);
});

test("semantic product paths do not catch checker failures and continue", () => {
  const roots = [
    join(repoRoot, "src/source/csharp-source-semantics"),
    join(repoRoot, "src/backend"),
  ];
  const forbidden = roots.flatMap(sourceFiles).flatMap((file) => {
    const text = readFileSync(file, "utf8");
    return catchBlocks(text).flatMap(({ block, line }) => {
      const catchesCheckerFailure = /\b(?:checker|typeShape)\.[A-Za-z_$][A-Za-z0-9_$]*\s*\(/u.test(block);
      const continuesWithMissingEvidence = /\breturn\s+(?:undefined|false|null)\b/u.test(block);
      return catchesCheckerFailure || continuesWithMissingEvidence
        ? [`${relative(repoRoot, file).split(sep).join("/")}:${line}`]
        : [];
    });
  });
  assert.deepEqual(forbidden, []);
});

test("selected-evidence audit has no unresolved local abstraction or lifecycle classifications", () => {
  const unresolved = buildSelectedEvidenceAuditRows(repoRoot)
    .filter((row) => row.classification === "wrong-abstraction-reworked" || row.classification === "lifecycle-ordering-bug")
    .map((row) => `${row.file}:${row.line}: ${row.classification}: ${row.symbol}`);
  assert.deepEqual(unresolved, []);
});

test("selected-evidence fixtures do not fabricate non-contract request fields", () => {
  const forbidden = "sourceSelectedContainerSymbol";
  const scannerFile = new URL(import.meta.url).pathname;
  const hits = sourceFiles(join(repoRoot, "test"))
    .filter((file) => file !== scannerFile)
    .filter((file) => readFileSync(file, "utf8").includes(forbidden))
    .map((file) => relative(repoRoot, file).split(sep).join("/"));
  assert.deepEqual(hits, []);
});

test("runtime-carrier request handling never uses declaration symbols as concrete carrier subjects", () => {
  const forbidden = sourceFiles(join(repoRoot, "src/source/csharp-source-semantics"))
    .flatMap((file) => {
      const source = readFileSync(file, "utf8");
      const blocks = source.match(/.{0,180}\brequest\.sourceSymbol\b.{0,180}/gu) ?? [];
      return blocks
        .filter((block) => /\b(?:csharpRuntimeCarrierFactKey|recordCsharpRuntimeCarrierFact|getRecordedCsharpRuntimeCarrierFact)\b/u.test(block))
        .map(() => relative(repoRoot, file).split(sep).join("/"));
    });
  assert.deepEqual(forbidden, []);
});

test("C# runtime-carrier writes are centralized and never target symbol-shaped subjects", () => {
  const productFiles = sourceFiles(join(repoRoot, "src"));
  const directWriteOwner = "src/source/csharp-facts/runtime-carrier.ts";
  const violations = [];
  for (const file of productFiles) {
    const relativeFile = relative(repoRoot, file).split(sep).join("/");
    const source = readFileSync(file, "utf8");
    if (relativeFile !== directWriteOwner && /\.set\([\s\S]{0,240}?\bcsharpRuntimeCarrierFactKey\b/u.test(source)) {
      violations.push(`${relativeFile}: direct fact-key write`);
    }
    for (const match of source.matchAll(/recordCsharpRuntimeCarrierFact\(\s*[^,]+,\s*([^,\n)]+)/gu)) {
      if (/(?:sourceSymbol|selectedSymbol|typeSymbol|\.symbol)\b/u.test(match[1] ?? "")) {
        violations.push(`${relativeFile}: symbol-shaped runtime-carrier write`);
      }
    }
  }
  assert.deepEqual(violations, []);
});

test("source declaration target templates never masquerade as concrete runtime carriers", () => {
  const files = [
    "src/source/csharp-source-semantics/source-declaration-facts/recording.ts",
    "src/source/csharp-source-semantics/target-type-reference-syntax.ts",
    "src/source/csharp-source-semantics/target-type-subject-resolution/source-declaration.ts",
  ];
  const forbiddenTokens = [
    "csharpRuntimeCarrierFactKey",
    "recordCsharpRuntimeCarrierFact",
    "getRecordedCsharpRuntimeCarrierFact",
    "resolveCsharpRuntimeCarrier",
  ];
  const forbidden = files.flatMap((file) => {
    const source = readFileSync(join(repoRoot, file), "utf8");
    return forbiddenTokens
      .filter((token) => source.includes(token))
      .map((token) => `${file}: ${token}`);
  });
  assert.deepEqual(forbidden, []);
});

test("runtime-carrier symbol provenance is declaration-invariant source-primitive evidence only", () => {
  const hits = sourceFiles(join(repoRoot, "src"))
    .flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return source.includes("request.sourceSymbol")
        ? [{ file: relative(repoRoot, file).split(sep).join("/"), source }]
        : [];
    });
  assert.deepEqual(hits.map(({ file }) => file), [
    "src/source/csharp-source-semantics/runtime-carrier-mapping/syntax.ts",
    "src/source/csharp-source-semantics/runtime-carrier-mapping.ts",
  ]);
  assert.match(
    hits[1]?.source ?? "",
    /const primitiveSubject = \[[\s\S]*request\.sourceSymbol[\s\S]*sourcePrimitiveFactKey/u,
  );
  assert.match(
    hits[0]?.source ?? "",
    /request\.sourceSymbol[\s\S]*targetBindingFactKey[\s\S]*request\.sourceSymbol[\s\S]*providerVirtualDeclarationFactKey/u,
  );
  assert.doesNotMatch(
    hits[0]?.source ?? "",
    /\b(?:csharpRuntimeCarrierFactKey|recordCsharpRuntimeCarrierFact|getRecordedCsharpRuntimeCarrierFact)\b/u,
  );
});

test("concrete runtime-carrier publication never falls back to declaration provenance", () => {
  const rules = [
    [
      "src/source/csharp-source-semantics/operation-selection/iteration.ts",
      /request\.sourceElement\.(?:selectedDeclaration|declaration|selectedSymbol|symbol)\b/gu,
    ],
    [
      "src/source/csharp-source-semantics/surfaces/js/calls/helpers.ts",
      /requestContext\.calleeReceiverTypeSymbol\b/gu,
    ],
    [
      "src/backend/planner/runtime-carriers.ts",
      /getTargetTypeRefFromSemanticTypeFacts\(input,\s*input\.analysis\.getTypeSymbol\(/gu,
    ],
  ];
  const violations = rules.flatMap(([file, pattern]) => {
    const source = readFileSync(join(repoRoot, file), "utf8");
    return [...source.matchAll(pattern)].map((match) => `${file}: ${match[0]}`);
  });
  assert.deepEqual(violations, []);
});

test("source return carrier templates stay on exact callable declarations, never shared symbols", () => {
  const rules = [
    [
      "src/source/csharp-source-semantics/surfaces/js/array-carrier-lifecycle/traversal.ts",
      /getArrayReturnSourceSubjects[\s\S]*?const subjects:[\s\S]*?\b(?:symbol|sourceSymbol|selectedSymbol)\b[\s\S]*?return subjects/gu,
    ],
    [
      "src/backend/planner/csharp-type-node/source-generic-types.ts",
      /getSourceReturnCarrierFromSelectedDeclaration[\s\S]*?reference\?\.symbol/gu,
    ],
  ];
  const violations = rules.flatMap(([file, pattern]) => {
    const source = readFileSync(join(repoRoot, file), "utf8");
    return [...source.matchAll(pattern)].map((match) => `${file}: ${match[0].slice(0, 80)}`);
  });
  assert.deepEqual(violations, []);
});

function sourceFiles(directory) {
  return readdirSync(directory).flatMap((entryName) => {
    const path = join(directory, entryName);
    return statSync(path).isDirectory()
      ? sourceFiles(path)
      : path.endsWith(".mjs") || path.endsWith(".ts")
        ? [path]
        : [];
  });
}

function catchBlocks(text) {
  const blocks = [];
  const pattern = /\bcatch\s*(?:\([^)]*\))?\s*\{/gu;
  for (const match of text.matchAll(pattern)) {
    const open = (match.index ?? 0) + match[0].lastIndexOf("{");
    let depth = 1;
    let index = open + 1;
    while (index < text.length && depth > 0) {
      if (text[index] === "{") {
        depth += 1;
      } else if (text[index] === "}") {
        depth -= 1;
      }
      index += 1;
    }
    blocks.push({
      block: text.slice(open + 1, Math.max(open + 1, index - 1)),
      line: text.slice(0, open).split("\n").length,
    });
  }
  return blocks;
}
