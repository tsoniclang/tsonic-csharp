import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  evaluateArchitecture,
  evaluateBarrelModules,
  formatArchitectureFindings,
} from "../../../tsonic/test/architecture/tooling/architecture-rules.mjs";
import { collectFiles, readSourceInventory } from "../../../tsonic/test/architecture/tooling/file-inventory.mjs";
import { classifyFiles } from "../../../tsonic/test/architecture/tooling/layer-classification.mjs";
import { buildTypeScriptModuleAnalysis } from "../../../tsonic/test/architecture/tooling/module-graph.mjs";
import { evaluateTestDomainOwnership } from "../../../tsonic/test/architecture/tooling/test-inventory.mjs";
import { evaluatePublicExportInventory } from "../../../tsonic/test/architecture/tooling/public-export-inventory.mjs";
import {
  csharpAllowedImplementationIndexes,
  csharpForbiddenDirectories,
  csharpForbiddenPackages,
  csharpLayerPolicies,
  csharpLayerRules,
  csharpRootPolicies,
  csharpSourceRules,
} from "./layer-policy.mjs";

const repositoryRoot = resolve(new URL("../..", import.meta.url).pathname);

test("C# architecture rules reject target-specific boundary mutations", () => {
  const mutations = [
    ["ARCH-CSHARP-CONFIG-001", "src/backend/planner/project.ts", "configuration.projectFile"],
    ["ARCH-CSHARP-PROGRAM-001", "src/analysis/program/model.ts", "readonly values: Map<string, string>;"],
    ["ARCH-CSHARP-SELECTION-001", "src/policy/members/selection/call.ts", "semantics.types.callSignatures(type);"],
  ];
  for (const [ruleId, file, source] of mutations) {
    assert.equal(
      csharpSourceRules.some((rule) => rule.ruleId === ruleId && rule.matches(file, source)),
      true,
      `${ruleId} did not reject its mutation`,
    );
  }
});

test("C# product imports conform to the declared architecture", () => {
  const sourceFiles = readSourceInventory(repositoryRoot, {
    extensions: [".ts"],
    exclude: ["dist", "node_modules", "test", ".temp", ".analysis"],
  });
  const classification = classifyFiles(sourceFiles.keys(), csharpLayerRules);
  const moduleAnalysis = buildTypeScriptModuleAnalysis(sourceFiles);
  const architecture = evaluateArchitecture({
    sourceFiles,
    edges: moduleAnalysis.edges,
    classifications: classification.classifications,
    layerPolicies: csharpLayerPolicies,
    forbiddenPackages: csharpForbiddenPackages,
    forbiddenDirectories: csharpForbiddenDirectories,
    rootPolicies: csharpRootPolicies,
    sourceRules: csharpSourceRules,
  });
  const barrelFindings = evaluateBarrelModules(moduleAnalysis.modules, {
    allowedImplementationFiles: csharpAllowedImplementationIndexes,
  });
  const findings = [
    ...classification.findings,
    ...architecture.findings,
    ...barrelFindings,
  ];
  assert.deepEqual(findings, [], formatArchitectureFindings(findings));
});

test("C# package exposes only approved audience entrypoints", async () => {
  const manifest = JSON.parse(readFileSync(resolve(repositoryRoot, "package.json"), "utf8"));
  assert.deepEqual(
    Object.keys(manifest.exports).sort(),
    [".", "./package.json", "./provider", "./provider/dotnet"],
  );
  assert.deepEqual(
    Object.keys(await awaitRuntimeExports("dist/index.js")).sort(),
    ["createCsharpTargetPack", "createTsonicPlugin", "csharpTargetId"],
  );
  const findings = evaluatePublicExportInventory({
    manifest,
    expectedEntrypoints: [".", "./package.json", "./provider", "./provider/dotnet"],
    sourceTextByEntrypoint: new Map([
      ["src/public/index.ts", readFileSync(resolve(repositoryRoot, "src/public/index.ts"), "utf8")],
      ["src/public/provider.ts", readFileSync(resolve(repositoryRoot, "src/public/provider.ts"), "utf8")],
    ]),
    forbiddenNamesByEntrypoint: new Map([
      ["src/public/index.ts", [
        "CsharpPlanningContext",
        "CsharpCompilationUnit",
        "CsharpTargetProgram",
        "planCsharpOutput",
        "printCsharpCompilationUnit",
      ]],
      ["src/public/provider.ts", [
        "CsharpPlanningContext",
        "createDotnetReflectionProviderBroker",
        "csharpRuntimeCarrierFactKey",
        "planCsharpOutput",
        "printCsharpCompilationUnit",
      ]],
    ]),
  });
  assert.deepEqual(findings, [], formatArchitectureFindings(findings));
});

test("C# tests mirror explicit architecture domains", () => {
  const domains = [
    "analysis",
    "architecture",
    "backend",
    "integration",
    "policy",
    "providers",
    "source",
    "toolchain",
  ];
  const files = collectFiles(resolve(repositoryRoot, "test"), {
    extensions: [".test.mjs"],
  }).map((file) => `test/${file}`);
  const findings = evaluateTestDomainOwnership(
    files,
    domains.map((domain) => ({
      directory: `test/${domain}`,
      productDomain: domain,
    })),
    new Set(domains),
  );
  assert.deepEqual(findings, [], formatArchitectureFindings(findings));
});

function awaitRuntimeExports(relativePath) {
  return import(new URL(`../../${relativePath}`, import.meta.url));
}
