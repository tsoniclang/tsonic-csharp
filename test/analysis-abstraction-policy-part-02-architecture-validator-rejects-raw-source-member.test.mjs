import { test } from "node:test";
import assert from "node:assert/strict";
import {
  analysisAbstractionDebtCatalog,
  analysisAbstractionDebtClassifications,
  analysisAbstractionDebtOwners,
  analysisAbstractionFileRules,
  analysisAbstractionRules,
  collectAnalysisAbstractionFindingsForSource,
  collectAnalysisAbstractionFindings,
  summarizeAnalysisAbstractionFindings,
} from "./architecture/analysis-abstraction-policy.mjs";

const repoRoot = new URL("..", import.meta.url).pathname;
const classificationSet = new Set(analysisAbstractionDebtClassifications);
const ownerSet = new Set(analysisAbstractionDebtOwners);





























function ruleMatches(rule, text) {
  rule.pattern.lastIndex = 0;
  return rule.pattern.test(text);
}

function assertFindings(file, text, expectedRuleIds) {
  assert.deepEqual(findingIds(file, text), expectedRuleIds);
}

function findingIds(file, text) {
  return collectAnalysisAbstractionFindingsForSource(file, text).map((finding) => finding.ruleId);
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

test("architecture validator rejects raw source members in executable JS target providers", () => {
  assertFindings(
    "src/source/csharp-source-semantics/surfaces/js/calls/member-providers/operation-types.ts",
    `
      export interface Request {
        readonly sourceMember: SourceLibraryMember;
      }
      provider.selectTargetMembers(request.sourceMember);
    `,
    [
      "js-surface-target-provider-raw-source-member",
      "js-surface-target-provider-raw-source-member",
    ],
  );

  assert.deepEqual(
    findingIds(
      "src/source/csharp-source-semantics/surfaces/js/calls/member-providers/operation-types.ts",
      `
        export interface Request {
          readonly selectedIdentity: JsSurfaceSelectedSourceIdentity;
        }
        provider.selectTargetMembers(request.selectedIdentity);
      `,
    ),
    [],
  );

  assertFindings(
    "src/source/csharp-source-semantics/surfaces/js/properties/member-providers/types.ts",
    `
      export interface Request {
        readonly sourceMember: SourceLibraryMember;
      }
      provider.selectTargetMembers(request.sourceMember);
    `,
    [
      "js-surface-property-provider-raw-source-member",
      "js-surface-property-provider-raw-source-member",
      "js-surface-property-executable-target-provider-callback",
    ],
  );

  assert.deepEqual(
    findingIds(
      "src/source/csharp-source-semantics/surfaces/js/properties/member-providers/types.ts",
      `
        export interface Request {
          readonly selectedIdentity: JsSurfaceSelectedSourceIdentity;
        }
        targetMembersFromProvider(provider, request.selectedIdentity);
      `,
    ),
    [],
  );
});
test("architecture validator rejects source-usage declaration filtering channels", () => {
  assertFindings(
    "src/source/csharp-source-semantics/semantic-hosts.ts",
    "const hints = context.target.sourceMemberNames;",
    ["source-usage-member-scan-channel"],
  );

  assertFindings(
    "src/source/csharp-source-semantics/semantic-hosts.ts",
    "const hints = context.sourceUsage?.memberNames;",
    ["source-usage-member-scan-channel"],
  );

  assertFindings(
    "src/providers/dotnet/declaration-model/types.ts",
    "function sourceMemberIsRequested(member, context) { return true; }",
    ["provider-declaration-member-usage-filter"],
  );

  assertFindings(
    "src/providers/dotnet/declaration-model/context.ts",
    "export interface TargetSourceUsageHints {}",
    ["source-usage-member-scan-channel"],
  );
});
test("architecture validator rejects policy-shaped filenames", () => {
  assertFindings(
    "src/source/csharp-source-semantics/surfaces/js/collection-target-metadata/map-policy.ts",
    `
      export const csharpJsMapCollectionPolicy = {
        sourceNames: ["Map", "ReadonlyMap"],
        target: { id: "Tsonic.CSharp.Js.Map" },
      };
    `,
    ["policy-shaped-file"],
  );

  assert.deepEqual(
    findingIds(
      "src/source/csharp-source-semantics/surfaces/js/collection-target-metadata/map-metadata.ts",
      `
        export const csharpJsMapCollectionMetadata = {
          sourceNames: ["Map", "ReadonlyMap"],
          target: { id: "Tsonic.CSharp.Js.Map" },
        };
      `,
    ),
    [],
  );
});
test("architecture validator rejects provider-row target members built from source names", () => {
  assertFindings(
    "src/source/csharp-source-semantics/surfaces/js/properties/member-providers/precheck-rules.ts",
    `
      targetMemberExistsRow(
        sourceKey("Object", sourceName),
        objectTargetMembersForSourceMember(createSourceLibraryMember("Object", sourceName)),
      );
    `,
    [
      "js-surface-source-member-target-lookup-api",
      "provider-row-target-member-from-created-source-member",
    ],
  );
});
test("architecture validator rejects Node target member synthesis from source names", () => {
  assertFindings(
    "src/source/csharp-source-semantics/provider-packages/nodejs/path/calls.ts",
    `
      return {
        member: {
          id: \`Tsonic.CSharp.Node.path.\${exportName}(\${signatureId.slice("node:path.".length + exportName.length + 1, -1)})\`,
          sourceName: exportName,
          targetName: exportName,
        },
      };
      return { sourceName, targetName };
      return { sourceName: sourceMemberName, targetName: sourceMemberName };
      return { targetName: nodeBufferFromExportName };
    `,
    [
      "nodejs-target-id-source-name-synthesis",
      "nodejs-target-member-name-source-copy",
      "nodejs-target-member-name-source-copy",
      "nodejs-target-member-name-source-copy",
      "nodejs-target-member-name-source-copy",
      "nodejs-target-member-name-source-copy",
      "nodejs-target-member-name-source-copy",
      "nodejs-target-name-source-constant-copy",
      "nodejs-target-id-signature-slice",
    ],
  );

  assertFindings(
    "src/source/csharp-source-semantics/provider-packages/nodejs/url/declarations.ts",
    `
      members: nodeUrlUnsupportedClassMemberDeclarations()
        .filter((member) => member.exportName === exportName)
        .map(providerMemberForUnsupportedUrlClassMember),
    `,
    ["nodejs-local-export-member-filter"],
  );

  assertFindings(
    "src/source/csharp-source-semantics/provider-packages/nodejs/filesystem/calls.ts",
    `
      const member = entries.find((row) => row.signatureId === signatureId);
    `,
    ["node-local-export-signature-selection"],
  );
});
test("architecture validator rejects executable selectors in metadata-policy files only", () => {
  assertFindings(
    "src/source/csharp-source-semantics/surfaces/js/collection-target-metadata/map-policy.ts",
    `
      export const csharpJsMapCollectionPolicy = {
        sourceNames: ["Map", "ReadonlyMap"],
        createClosedType: (typeArguments) => csharpJsMapTargetType(typeArguments[0], typeArguments[1]),
        isTargetType: isCsharpJsMapTargetType,
      };
    `,
    [
      "policy-shaped-file",
      "collection-target-metadata-executable-policy-file",
      "collection-target-metadata-executable-policy-file",
    ],
  );

  assertFindings(
    "src/source/csharp-source-semantics/provider-packages/nodejs/provider-metadata/fs.ts",
    `
      export const fsRows = [{
        sourceIdentity: "fs.readFile",
        resolve: (sourceMember) => sourceMember.id,
      }];
    `,
    [
      "provider-metadata-executable-selector-file",
      "source-id-executable-policy-hook",
    ],
  );

  assert.deepEqual(
    findingIds(
      "src/source/csharp-source-semantics/provider-packages/nodejs/provider-metadata/fs.ts",
      `
        export const fsRows = [{
          sourceIdentity: "fs.readFile",
          targetIdentity: "System.IO.File.ReadAllText",
          receiver: "none",
        }];
      `,
    ),
    [],
  );
});
test("architecture validator rejects broad numeric primitive-name fallback", () => {
  assertFindings(
    "src/source/csharp-source-semantics/target-ref-utils.ts",
    `
      export function targetTypeRefRefinesBroadNumericFallback(candidate, existing) {
        return candidate.name !== "float64" && existing.name === "float64";
      }
      if (argumentType.name === "float64") {
        return true;
      }
    `,
    [
      "broad-numeric-fallback-helper",
      "float64-primitive-refinement-heuristic",
      "float64-primitive-refinement-heuristic",
    ],
  );

  assert.deepEqual(
    findingIds(
      "src/source/csharp-source-semantics/target-rules.ts",
      `
        if (source.name === "int32" && target.name === "float64") {
          return csharpConvertToDoubleOperation;
        }
      `,
    ),
    [],
  );
});