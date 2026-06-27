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

test("architecture validator rejects source-member id dispatch and tables", () => {
  assertFindings(
    "src/source/csharp-source-semantics/surfaces/js/array-carrier-lifecycle/array-use-rules.ts",
    `
      const propertyRule = propertyRequirementRowsBySourceIdentity.get(sourceMember.id);
      return propertyRequirementRowsBySourceIdentity.has(sourceMember.id);
      const fullJsArrayMemberIds = sourceMemberIdSet(["Array.flat"]);
      const rows = sourceLibraryMemberIdSet(["JSON.parse"]);
    `,
    [
      "source-member-id-map-dispatch",
      "source-member-id-map-dispatch",
      "source-member-id-set-table-definition",
      "source-member-id-set-table-definition",
    ],
  );

  assert.deepEqual(
    findingIds(
      "src/source/csharp-source-semantics/source-identities/array.ts",
      `
        export const arrayCallableIdentityPolicy = {
          ids: sourceLibraryMemberIdSet(["Array.map"]),
        } satisfies SourceLibraryMemberIdentityPolicy;
      `,
    ),
    [],
  );
});

test("architecture validator rejects procedural selector branches over source names", () => {
  assertFindings(
    "src/source/csharp-source-semantics/surfaces/js/calls/target-selection.ts",
    `
      if (sourceName === "push") {
        return candidates[0];
      }
      switch (sourceMember.id) {
        case "Array.push":
          return candidates[0];
      }
      if (sourceMember.id.includes("Map.")) {
        return candidates[0];
      }
      if (sourceName.startsWith("fs.")) {
        return candidates[0];
      }
    `,
    [
      "source-member-id-switch",
      "source-member-id-method-branch",
      "source-name-branch",
      "source-name-method-branch",
    ],
  );
});

test("architecture validator rejects Map and Set carrier selection from source-family spellings", () => {
  assertFindings(
    "src/source/csharp-source-semantics/backend/map-set-carriers.ts",
    `
      if (declaringName === "Map") {
        return dictionaryCarrier;
      }
      if (declaringName !== "Set") {
        return hashSetCarrier;
      }
    `,
    [
      "map-set-carrier-source-family-branch",
      "map-set-carrier-source-family-branch",
    ],
  );
});

test("architecture validator rejects procedural source-member policy dispatch", () => {
  assertFindings(
    "src/source/csharp-source-semantics/surfaces/js/properties/member-providers/registry.ts",
    `
      const rule = propertyPrecheckRows.find((candidate) => propertyPrecheckRuleApplies(candidate, sourceMember));
      return propertyReceiverRequirementRows.some((policy) => sourceLibraryMemberMatches(sourceMember, policy.identity));
    `,
    [
      "js-surface-property-legacy-provider-shape",
      "procedural-source-member-table-dispatch",
      "procedural-source-member-table-dispatch",
    ],
  );
});

test("architecture validator rejects source-family-shaped closed-fact requirements", () => {
  assertFindings(
    "src/source/csharp-source-semantics/surfaces/js/calls/closed-facts/receiver-validation.ts",
    `
      const rows = [
        { requirement: { kind: "array-receiver" } },
        { requirement: { kind: "collection-receiver", target: "map" } },
        { requirement: { kind: "collection-receiver", target: "set" } },
      ];
    `,
    [
      "source-family-closed-facts-requirement",
      "source-family-closed-facts-requirement",
      "source-family-closed-facts-requirement",
      "source-family-closed-facts-requirement",
      "source-family-closed-facts-requirement",
    ],
  );
  assert.deepEqual(
    findingIds(
      "src/source/csharp-source-semantics/surfaces/js/calls/closed-facts/receiver-validation.ts",
      `
        const rows = [
          { requirement: { kind: "receiver", target: "array-like" } },
          { requirement: { kind: "receiver", target: "selected-collection-carrier" } },
          { requirement: { kind: "known-argument-targets" } },
        ];
      `,
    ),
    [],
  );
});

test("architecture validator rejects executable hooks in policy-like records", () => {
  const hookRule = analysisAbstractionRules.find((rule) => rule.id === "source-id-executable-policy-hook");
  assert.notEqual(hookRule, undefined);
  const forbidden = [
    "const row = { validate: (request) => request.ok };",
    "const row = { resolve: resolveTargetMember };",
    "const row = { result: (request) => request.result };",
    "const row = { requiresClosedReceiver: (request) => request.receiver };",
    "const row = { mapCall: mapArrayCall };",
  ];
  const allowed = [
    "const row = { result: \"defer\" };",
    "interface Row { readonly result: CsharpJsPropertyPrecheckResult; }",
    "const row = { sourceIdentity: \"Array.map\", targetIdentity: \"Tsonic.CSharp.Js.Array.map\" };",
  ];
  assert.deepEqual(forbidden.map((text) => ruleMatches(hookRule, text)), [true, true, true, true, true]);
  assert.deepEqual(allowed.map((text) => ruleMatches(hookRule, text)), [false, false, false]);
});

test("architecture validator rejects target-member synthesis from source names", () => {
  assertFindings(
    "src/source/csharp-source-semantics/surfaces/js/arrays/target-members/builders.ts",
    `
      return {
        id: \`Tsonic.CSharp.Js.Array.\${sourceName}\`,
        sourceName,
        targetName: sourceName,
      };
    `,
    [
      "target-member-source-name-synthesis",
      "target-member-source-name-synthesis",
    ],
  );

  assert.deepEqual(
    findingIds(
      "src/source/csharp-source-semantics/surfaces/js/arrays/target-members/metadata.ts",
      `
        export const arrayMapTargetMember = {
          id: "Tsonic.CSharp.Js.Array.map",
          sourceName: "map",
          targetName: "map",
        };
      `,
    ),
    [],
  );
});

test("architecture validator rejects runtime member filtering by source names", () => {
  assertFindings(
    "src/source/csharp-source-semantics/surfaces/js/objects.ts",
    `
      return rows
        .filter((member) => member.sourceName === operation)
        .map(jsSurfaceTargetMemberFromMetadata);
    `,
    ["source-name-runtime-member-filter"],
  );

  assert.deepEqual(
    findingIds(
      "src/source/csharp-source-semantics/surfaces/js/objects.ts",
      `
        const row = rowsByOperation[operation];
        return row === undefined ? [] : [targetMemberFromExplicitRow(row)];
      `,
    ),
    [],
  );
});

test("architecture validator rejects JS target lookups from raw source members", () => {
  assertFindings(
    "src/source/csharp-source-semantics/surfaces/js/selected-target-member-metadata.ts",
    `
      export function jsSurfaceSelectedTargetMembersForSourceMember(sourceMember) { return []; }
      export function arrayTargetMembersForSourceMember(sourceMember) { return []; }
      export function mathPropertyTargetMemberForSourceMember(sourceMember) { return undefined; }
    `,
    [
      "js-surface-source-member-target-lookup-api",
      "js-surface-source-member-target-lookup-api",
      "js-surface-source-member-target-lookup-api",
    ],
  );

  assert.deepEqual(
    findingIds(
      "src/source/csharp-source-semantics/surfaces/js/selected-target-member-metadata.ts",
      `
        export function jsSurfaceSelectedTargetMembersForSelectedIdentity(selectedIdentity) { return []; }
      `,
    ),
    [],
  );
});

test("architecture validator rejects array target ids defaulted from source names", () => {
  assertFindings(
    "src/source/csharp-source-semantics/surfaces/js/arrays/target-members/builders.ts",
    `
      export function arrayStaticMethod(sourceName, idSuffix = sourceName) {}
      return { id: \`Tsonic.CSharp.Js.Array.\${options.idSuffix ?? sourceName}\` };
      return { id: \`Tsonic.CSharp.Js.Array.\${options.idBase ?? sourceName}:1\` };
      arrayHelperMethod(sourceName, targetName, [], result, owner, { idSuffix: \`\${sourceName}:value\` });
      arrayCallbackHelpers(sourceName, targetName, kind, item, result, member, array, owner, { idBase: \`\${sourceName}:value\` });
    `,
    [
      "js-array-target-id-source-name-default",
      "js-array-target-id-source-name-default",
      "js-array-target-id-source-name-default",
      "js-array-target-id-source-name-default",
      "js-array-target-id-source-name-default",
    ],
  );

  assert.deepEqual(
    findingIds(
      "src/source/csharp-source-semantics/surfaces/js/arrays/target-members/metadata.ts",
      `
        arrayHelperMethod("push", "push", [], result, owner, { idSuffix: "push" });
        arrayCallbackHelpers("map", "map", kind, item, result, member, array, owner, { idBase: "map" });
      `,
    ),
    [],
  );
});

test("architecture validator rejects source-member provider hooks", () => {
  assertFindings(
    "src/source/csharp-source-semantics/surfaces/js/calls/member-providers/operation-selection.ts",
    `
      type SourceCallMemberProvider =
        | { readonly kind: "metadata-by-source-identity"; readonly membersForSourceMember: (sourceMember: SourceLibraryMember) => readonly TargetMember[] };
      return provider.membersForSourceMember(sourceMember);
    `,
    [
      "function-valued-source-member-provider-hook",
      "source-member-provider-hook-dispatch",
    ],
  );
});

test("architecture validator rejects JS surface provider kind literals", () => {
  assertFindings(
    "src/source/csharp-source-semantics/surfaces/js/calls/member-providers/operation-types.ts",
    `
      members: { kind: "date-call-kind" };
      targetProvider: { kind: "operation-adapter" };
      const provider = operationAdapterProvider(makeThing());
      case "object-composite":
      case "array-carrier":
      case "collection-carrier":
      case "console-metadata":
    `,
    [
      "js-surface-call-provider-kind-literal",
      "js-surface-call-provider-kind-literal",
      "js-surface-call-provider-kind-literal",
      "js-surface-call-provider-kind-literal",
      "js-surface-call-provider-kind-literal",
      "js-surface-call-legacy-provider-shape",
      "js-surface-call-legacy-provider-shape",
    ],
  );

  assertFindings(
    "src/source/csharp-source-semantics/surfaces/js/calls/member-providers/operation-types.ts",
    `
      interface JsSurfaceOperationTargetProviderResolver {
        readonly selectTargetMembers: (request: Request) => readonly TargetMember[];
        readonly hasCallableProvider: (request: Request) => boolean;
      }
      type Provider = { readonly resolver: JsSurfaceOperationTargetProviderResolver };
    `,
    [
      "js-surface-call-executable-target-provider-callback",
      "js-surface-call-executable-target-provider-callback",
      "js-surface-call-executable-target-provider-callback",
      "js-surface-call-executable-target-provider-callback",
      "js-surface-call-executable-target-provider-callback",
    ],
  );

  assertFindings(
    "src/source/csharp-source-semantics/surfaces/js/calls/target-selection.ts",
    `
      export function sourceLibraryCallSelectionOptions() {
        const receiver = getCsharpArrayLikeElementType(type);
        return {
          declaringTargetType: receiver,
          declaringTypeParameters: [{ name: "T" }],
        };
      }
    `,
    [
      "js-surface-call-selector-declaring-type-synthesis",
      "js-surface-call-selector-declaring-type-synthesis",
      "js-surface-call-selector-declaring-type-synthesis",
      "js-surface-call-selector-declaring-type-synthesis",
    ],
  );

  assertFindings(
    "src/source/csharp-source-semantics/surfaces/js/properties/member-providers/registry.ts",
    `
      case "collection-size":
      case "string-length":
      case "array-length":
    `,
    [
      "js-surface-property-provider-kind-literal",
      "js-surface-property-provider-kind-literal",
      "js-surface-property-provider-kind-literal",
    ],
  );

  assertFindings(
    "src/source/csharp-source-semantics/surfaces/js/selected-target-member-metadata.ts",
    `
      interface ContextualProvider {
        readonly resolver: Resolver;
        readonly selectTargetMembers: (request: Request) => readonly TargetMember[];
      }
      provider.resolver.selectTargetMembers(request);
    `,
    [
      "js-surface-selected-target-executable-callback",
      "js-surface-selected-target-executable-callback",
      "js-surface-selected-target-executable-callback",
    ],
  );

  assertFindings(
    "src/source/csharp-source-semantics/surfaces/js/properties/member-providers/registry.ts",
    `
      const provider: CsharpJsPropertyMemberProvider = propertyMemberProviderBySourceIdentity.get(selectedIdentity.key);
      const member: CsharpJsPropertyMemberProviderValue = provider.member;
      const precheck: CsharpJsPropertyPrecheckRule = propertyPrecheckRows[0];
      const result: CsharpJsPropertyPrecheckResult = precheck.result;
      const rows = propertyMemberRows;
      targetProvider: { kind: "operation-adapter" };
    `,
    [
      "js-surface-property-legacy-provider-shape",
      "js-surface-property-legacy-provider-shape",
      "js-surface-property-legacy-provider-shape",
      "js-surface-property-legacy-provider-shape",
      "js-surface-property-legacy-provider-shape",
      "js-surface-property-legacy-provider-shape",
      "js-surface-property-legacy-provider-shape",
      "js-surface-property-legacy-provider-shape",
    ],
  );

  assertFindings(
    "src/source/csharp-source-semantics/surfaces/js/properties/member-providers/types.ts",
    `
      interface JsSurfacePropertyTargetProviderResolver {
        readonly selectTargetMembers: (request: Request) => readonly TargetMember[];
      }
      type Provider = { readonly resolver: JsSurfacePropertyTargetProviderResolver };
      provider.resolver.selectTargetMembers(request);
    `,
    [
      "js-surface-property-executable-target-provider-callback",
      "js-surface-property-executable-target-provider-callback",
      "js-surface-property-executable-target-provider-callback",
      "js-surface-property-executable-target-provider-callback",
      "js-surface-property-executable-target-provider-callback",
    ],
  );
});

test("architecture validator rejects array lifecycle source-member target factories", () => {
  assertFindings(
    "src/source/csharp-source-semantics/surfaces/js/array-carrier-lifecycle/array-use-rules.ts",
    `
      type SelectedSourceMemberTargetMemberFactory = (sourceMember) => [];
      const selectedSourceMemberTargetMemberFactories = [
        (sourceMember) => arrayTargetMembersForSourceMember(sourceMember),
        (sourceMember) => objectTargetMembersForSourceMember(sourceMember),
        (sourceMember) => jsonTargetMembersForSourceMember(sourceMember),
      ];
      const selected = getSelectedSourceLibraryMemberForStructuralUse(use, context) as SourceLibraryMember;
    `,
    [
      "js-surface-source-member-target-lookup-api",
      "js-surface-source-member-target-lookup-api",
      "js-surface-source-member-target-lookup-api",
      "js-array-lifecycle-source-member-factory-list",
      "js-array-lifecycle-source-member-factory-list",
      "js-array-lifecycle-source-member-factory-list",
      "js-array-lifecycle-source-member-factory-list",
      "js-array-lifecycle-source-member-factory-list",
      "js-array-lifecycle-raw-source-member-selection",
      "js-array-lifecycle-raw-source-member-selection",
    ],
  );
});

test("architecture validator rejects JS source-family provider flags", () => {
  assertFindings(
    "src/source/csharp-source-semantics/surfaces/js/calls/member-providers/operation-rows.ts",
    `
      const row = {
        members: {
          dateCallConstructMembers: true,
          objectPrimitiveReceiverMembers: true,
          objectRecordDictionaryMembers: true,
          arrayCarrierMembers: true,
          collectionCarrierMembers: true,
        },
        callable: {
          membersExist: true,
          arrayMembersOrCallSurface: true,
          collectionMembersExist: true,
        },
      };
    `,
    [
      "js-surface-source-family-provider-flag",
      "js-surface-source-family-provider-flag",
      "js-surface-source-family-provider-flag",
      "js-surface-source-family-provider-flag",
      "js-surface-source-family-provider-flag",
      "js-surface-source-family-provider-flag",
      "js-surface-source-family-provider-flag",
      "js-surface-source-family-provider-flag",
    ],
  );
});

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
    "src/source/csharp-source-semantics/surfaces/nodejs/path/calls.ts",
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
    "src/source/csharp-source-semantics/surfaces/nodejs/url/declarations.ts",
    `
      members: nodeUrlUnsupportedClassMemberDeclarations()
        .filter((member) => member.exportName === exportName)
        .map(providerMemberForUnsupportedUrlClassMember),
    `,
    ["nodejs-local-export-member-filter"],
  );

  assertFindings(
    "src/source/csharp-source-semantics/surfaces/nodejs/filesystem/calls.ts",
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
    "src/source/csharp-source-semantics/surfaces/nodejs/provider-metadata/fs.ts",
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
      "src/source/csharp-source-semantics/surfaces/nodejs/provider-metadata/fs.ts",
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
