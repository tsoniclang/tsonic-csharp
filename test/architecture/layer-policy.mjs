import {
  canonicalTargetForbiddenDirectories,
  canonicalTargetLayerPolicies,
  canonicalTargetSourceRules,
  targetForbiddenPackage,
  targetLayerExact,
  targetLayerPrefix,
  targetLayerPredicate,
  targetRootPolicy,
} from "../../../tsonic/test/architecture/tooling/target-layer-contract.mjs";

function isCsharpProviderModel(path) {
  return path.startsWith("src/providers/model/") ||
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

export const csharpRootPolicies = Object.freeze([
  targetRootPolicy("src/", ["src/index.ts"]),
  targetRootPolicy("src/backend/", ["src/backend/compile.ts"]),
  targetRootPolicy("src/backend/planner/", [
    "src/backend/planner/context.ts",
    "src/backend/planner/csharp-planner.ts",
    "src/backend/planner/diagnostics.ts",
  ]),
  targetRootPolicy("src/policy/", ["src/policy/context.ts", "src/policy/index.ts"]),
  targetRootPolicy("src/source/", ["src/source/index.ts"]),
]);

export const csharpAllowedImplementationIndexes = new Set([
  "src/public/index.ts",
]);

export const csharpForbiddenDirectories = canonicalTargetForbiddenDirectories;

export const csharpSourceRules = Object.freeze([
  ...canonicalTargetSourceRules,
  Object.freeze({
    ruleId: "ARCH-CSHARP-CONFIG-001",
    matches: (file, source) => file.startsWith("src/backend/") &&
      /\bconfiguration\.projectFile\b|from\s+["'][^"']*\/options\//u.test(source),
    reason: "C# analysis and backend planning consume the one normalized target configuration.",
  }),
  Object.freeze({
    ruleId: "ARCH-CSHARP-PROGRAM-001",
    matches: (file, source) => file === "src/analysis/program/model.ts" &&
      /\b(?:Map|Set|Builder|Registry)\s*</u.test(source),
    reason: "The sealed C# target program cannot expose mutable collections or builders.",
  }),
  Object.freeze({
    ruleId: "ARCH-CSHARP-SELECTION-001",
    matches: (file, source) => (
      file.startsWith("src/policy/members/selection/") ||
      file.startsWith("src/backend/planner/expressions/target-members/")
    ) && /\.types\.(?:propertyInfos|callSignatures|constructSignatures)\s*\(/u.test(source),
    reason: "Checked C# member mapping consumes selected operation evidence and cannot fall back to structural member or signature enumeration.",
  }),
]);
