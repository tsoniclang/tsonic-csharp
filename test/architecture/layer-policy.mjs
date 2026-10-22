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
  providerModelPaths: ["src/providers/model/provider-relations.ts"],
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
    "src/policy/operations/members/call-forms.ts",
    "src/policy/operations/members/native-use-arguments.ts",
    "src/policy/operations/members/source-argument-groups.ts",
    "src/backend/planner/expressions/calls/",
    "src/backend/planner/expressions/receiver-call-property.ts",
    "src/backend/planner/expressions/selected-element.ts",
    "src/backend/planner/expressions/selected-property.ts",
    "src/backend/planner/expressions/source-member-names.ts",
    "src/backend/planner/expressions/source-owned-members.ts",
    "src/backend/planner/expressions/target-member-call.ts",
    "src/backend/planner/expressions/target-member-element-access.ts",
    "src/backend/planner/expressions/target-member-property-access.ts",
  ]),
]);
