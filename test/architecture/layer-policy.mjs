import {
  canonicalTargetForbiddenDirectories,
  canonicalTargetLayerPolicies,
  canonicalTargetRootPolicies,
  canonicalTargetSourceRules,
  selectedTargetEvidenceRule,
  targetForbiddenPackage,
  targetLayerExact,
  targetLayerPrefix,
  targetLayerPredicate,
} from "../../../tsonic/test/architecture/tooling/target-layer-contract.mjs";

function isCsharpProviderModel(path) {
  return path.startsWith("src/providers/model/") ||
    path === "src/providers/packages/model.ts" ||
    path === "src/providers/relations/index.ts" ||
    path === "src/providers/relations/relation-model.ts";
}

export const csharpLayerRules = Object.freeze([
  targetLayerExact(["src/index.ts", "src/public/index.ts"], "public-root"),
  targetLayerExact(["src/public/provider.ts", "src/public/provider-dotnet.ts"], "public-provider-sdk"),
  targetLayerPrefix("src/descriptor/", "descriptor"),
  targetLayerPrefix("src/compilation/", "compilation"),
  targetLayerPrefix("src/options/", "options"),
  targetLayerPrefix("src/source/", "source"),
  targetLayerPredicate("provider-model", isCsharpProviderModel),
  targetLayerPredicate(
    "provider-implementation",
    (path) => path.startsWith("src/providers/") && !isCsharpProviderModel(path),
  ),
  targetLayerPrefix("src/target-model/", "target-model"),
  targetLayerPrefix("src/policy/", "policy"),
  targetLayerPrefix("src/analysis/", "analysis"),
  targetLayerPrefix("src/backend/target-ast/", "target-ast"),
  targetLayerPrefix("src/backend/artifact-model/", "artifact-model"),
  targetLayerPrefix("src/backend/planner/", "planner"),
  targetLayerPrefix("src/backend/emission/", "emission"),
  targetLayerExact(["src/backend/compile.ts"], "backend-entrypoint"),
  targetLayerPrefix("src/print/", "printer"),
  targetLayerPrefix("src/toolchain/", "toolchain"),
]);

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
