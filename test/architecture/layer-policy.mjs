const exactTargetModelFiles = new Set([
  "src/policy/types/model/definitions.ts",
  "src/policy/types/model/identity.ts",
  "src/policy/types/model/target-refs.ts",
]);

export const csharpLayerRules = Object.freeze([
  exact(["src/index.ts"], "public-entrypoint"),
  prefix("src/public/", "public-entrypoint"),
  prefix("src/descriptor/", "descriptor"),
  prefix("src/options/", "options"),
  prefix("src/source/", "source"),
  prefix("src/providers/model/", "provider-model"),
  prefix("src/providers/relations/", "provider-model"),
  prefix("src/providers/builtins/", "provider-implementation"),
  prefix("src/providers/dotnet/", "provider-implementation"),
  prefix("src/providers/resolution/", "provider-implementation"),
  {
    layer: "target-model",
    matches: (path) => exactTargetModelFiles.has(path),
  },
  {
    layer: "policy",
    matches: (path) => path.startsWith("src/policy/") && !exactTargetModelFiles.has(path),
  },
  prefix("src/analysis/", "analysis"),
  prefix("src/backend/roslyn/", "target-ast"),
  prefix("src/backend/artifacts/", "artifact-model"),
  prefix("src/backend/project-model/", "artifact-model"),
  prefix("src/backend/planner/", "planner"),
  prefix("src/backend/emission/", "emission"),
  exact(["src/backend/csharp-backend.ts"], "backend-entrypoint"),
  prefix("src/print/", "printer"),
  prefix("src/toolchain/", "toolchain"),
]);

export const csharpLayerPolicies = Object.freeze([
  policy("public-entrypoint", [
    "descriptor", "options", "source", "provider-model",
    "provider-implementation", "target-model", "policy",
  ], "ARCH-API-001", "Public entrypoints may expose only approved plugin, option, source identity, and provider-authoring contracts."),
  policy("descriptor", [
    "backend-entrypoint", "options", "source", "provider-model",
    "provider-implementation", "toolchain",
  ], "ARCH-TARGET-001", "The target descriptor composes target services but does not consume analysis, planning internals, or printers directly."),
  policy("options", [], "ARCH-TARGET-001", "Target options are leaf configuration contracts."),
  policy("source", ["provider-model", "target-model", "policy"], "ARCH-POLICY-001", "Source composition may depend on immutable target contracts, not target execution layers."),
  policy("provider-model", ["target-model"], "ARCH-PROVIDER-001", "Provider contracts may depend only on shared source contracts and the immutable C# target model."),
  policy("provider-implementation", [
    "options", "provider-model", "target-model", "policy", "source",
  ], "ARCH-PROVIDER-001", "Provider implementation cannot depend on analysis, planning, printing, emission, or toolchain execution."),
  policy("target-model", [], "ARCH-POLICY-001", "The immutable C# target model is a leaf below policy and providers."),
  policy("policy", ["target-model", "provider-model", "source"], "ARCH-POLICY-001", "C# policy cannot depend on analysis, planning, target AST, printing, emission, or toolchain execution."),
  policy("analysis", ["target-model", "provider-model", "policy", "source"], "ARCH-ANALYSIS-001", "C# analysis produces finalized decisions and cannot consume planning or emission layers."),
  policy("target-ast", ["target-model"], "ARCH-PLANNER-001", "The typed C# syntax model cannot depend on policy, analysis, planning, or printing."),
  policy("artifact-model", ["target-ast", "target-model", "options"], "ARCH-PLANNER-001", "Artifact and project models contain completed data, not planner or printer behavior."),
  policy("planner", [
    "analysis", "policy", "target-model", "target-ast", "artifact-model",
    "source", "provider-model", "provider-implementation", "options",
  ], "ARCH-PLANNER-001", "Planning may consume finalized target inputs but cannot invoke emission, printers, or toolchains."),
  policy("emission", ["artifact-model", "printer"], "ARCH-PRINTER-001", "Emission materializes completed typed artifacts through pure printers."),
  policy("backend-entrypoint", ["analysis", "planner", "emission"], "ARCH-PLANNER-001", "The backend entrypoint only sequences analysis, planning, and materialization."),
  policy("printer", ["target-ast", "artifact-model"], "ARCH-PRINTER-001", "C# printers consume only typed syntax and completed project models."),
  policy("toolchain", ["artifact-model", "options"], "ARCH-TOOLCHAIN-001", "The .NET toolchain consumes completed artifacts and target options only."),
]);

export const csharpForbiddenPackages = Object.freeze([
  forbidden("@tsonic/target-rust"),
  forbidden("@tsonic/rust-runtime"),
  forbidden("@tsonic/rust-js"),
  forbidden("@tsonic/rust-nodejs"),
]);

export const csharpRootPolicies = Object.freeze([
  root("src/", ["src/index.ts"]),
  root("src/backend/", ["src/backend/csharp-backend.ts"]),
  root("src/backend/planner/", [
    "src/backend/planner/context.ts",
    "src/backend/planner/csharp-planner.ts",
    "src/backend/planner/diagnostics.ts",
  ]),
  root("src/policy/", ["src/policy/context.ts", "src/policy/index.ts"]),
  root("src/source/", [
    "src/source/identities.ts",
    "src/source/index.ts",
    "src/source/literal-values.ts",
  ]),
]);

export const csharpAllowedImplementationIndexes = new Set([
  "src/public/index.ts",
]);

export const csharpForbiddenDirectories = Object.freeze([
  "common",
  "helpers",
  "misc",
  "translate",
  "utils",
]);

function prefix(pathPrefix, layer) {
  return Object.freeze({
    layer,
    matches: (path) => path.startsWith(pathPrefix),
  });
}

function exact(paths, layer) {
  const values = new Set(paths);
  return Object.freeze({
    layer,
    matches: (path) => values.has(path),
  });
}

function policy(source, allowed, ruleId, reason) {
  return Object.freeze({ source, allowed: new Set(allowed), ruleId, reason });
}

function forbidden(prefixValue) {
  return Object.freeze({
    prefix: prefixValue,
    ruleId: "ARCH-TARGET-001",
    reason: `C# target source cannot depend on sibling target package '${prefixValue}'.`,
  });
}

function root(prefixValue, allowed) {
  return Object.freeze({ prefix: prefixValue, allowed: new Set(allowed) });
}
