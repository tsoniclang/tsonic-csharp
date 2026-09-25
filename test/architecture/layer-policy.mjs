import {
  canonicalTargetForbiddenDirectories,
  canonicalTargetLayerPolicies,
  canonicalTargetRootPolicies,
  canonicalTargetSourceRules,
  selectedTargetEvidenceRule,
  targetForbiddenPackage,
  createTargetLayerRules,
} from "../../../tsonic/test/architecture/tooling/target-layer-contract.mjs";

export const csharpLayerRules = createTargetLayerRules({
  providerModelPaths: ["src/providers/relations/index.ts", "src/providers/relations/relation-model.ts"],
  providerSdkPaths: ["src/public/provider-dotnet.ts"],
});

export const csharpLayerPolicies = canonicalTargetLayerPolicies;

export const csharpForbiddenPackages = Object.freeze([
  targetForbiddenPackage("@tsonic/target-rust", "C#"),
  targetForbiddenPackage("@tsonic/rust-runtime", "C#"),
  targetForbiddenPackage("@tsonic/rust-js", "C#"),
  targetForbiddenPackage("@tsonic/rust-nodejs", "C#"),
]);

export const csharpRootPolicies = canonicalTargetRootPolicies;

export const csharpAllowedImplementationIndexes = new Set([
  "src/public/index.ts",
]);

export const csharpForbiddenDirectories = canonicalTargetForbiddenDirectories;

export const csharpSourceRules = Object.freeze([
  ...canonicalTargetSourceRules,
  selectedTargetEvidenceRule([
    "src/policy/operations/members/selection/",
    "src/backend/planner/expressions/target-members/",
  ]),
]);
