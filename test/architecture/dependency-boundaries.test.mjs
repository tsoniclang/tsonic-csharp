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
    ["ARCH-TARGET-PLANNER-002", "src/backend/planner/call.ts", "selectCsharpTargetCall(node);"],
    ["ARCH-TARGET-ANALYSIS-002", "src/analysis/calls.ts", 'import { planCall } from "../backend/planner/call.js";'],
    ["ARCH-TARGET-MODEL-001", "src/target-model/types.ts", 'import { analyzeType } from "../analysis/types.js";'],
    ["ARCH-TARGET-PRINTER-002", "src/print/source.ts", 'import { selectType } from "../policy/types.js";'],
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

test("sealed C# classification queries cannot delegate to analysis policy", () => {
  const projectTypes = readFileSync(
    resolve(repositoryRoot, "src/analysis/project-types/analyze.ts"),
    "utf8",
  );
  const projectQueries = sourceSection(
    projectTypes,
    "const classifications: CsharpProjectTypeClassifications = {",
    "function visit(node: Node): void",
  );
  assert.doesNotMatch(projectQueries, /\bpolicy\./u);

  const storage = readFileSync(
    resolve(repositoryRoot, "src/analysis/storage/analyze.ts"),
    "utf8",
  );
  const storageQueries = sourceSection(
    storage,
    "const classifications: CsharpStorageClassifications = {",
    "function visit(node: Node): void",
  );
  assert.doesNotMatch(storageQueries, /\bpolicy\.|\bnavigation\./u);

  const names = readFileSync(
    resolve(repositoryRoot, "src/analysis/names/source-names.ts"),
    "utf8",
  );
  const nameQuery = sourceSection(
    names,
    "function resolve(",
    "return Object.freeze({ resolve });",
  );
  assert.doesNotMatch(nameQuery, /\bhost\./u);
});

test("expected-result specializations are classified by exact target use", () => {
  const analysis = readFileSync(
    resolve(repositoryRoot, "src/analysis/expected-types/analyze.ts"),
    "utf8",
  );
  assert.match(analysis, /createTargetUseClassificationBuilder/u);
  assert.match(analysis, /"binary-expected-result"/u);
  assert.match(analysis, /csharpTargetRepresentationContractId/u);

  const planner = readFileSync(
    resolve(
      repositoryRoot,
      "src/backend/planner/expressions/operators/nullish-expected-type.ts",
    ),
    "utf8",
  );
  assert.match(planner, /program\.expectedTypes\.binaryExpected/u);
  assert.doesNotMatch(planner, /selectCsharpBinaryOperation/u);
});

test("C# conversion analysis seals sparse exact uses without a type Cartesian product", () => {
  const analysis = readFileSync(
    resolve(repositoryRoot, "src/analysis/conversions/analyze.ts"),
    "utf8",
  );
  assert.match(analysis, /classifyExpression\(/u);
  assert.match(analysis, /classifyPair\(/u);
  assert.match(analysis, /seal\(\{ operations, expectedTypes, storage \}\)/u);
  assert.doesNotMatch(analysis, /types\.size\s*\*\s*types\.size/u);
  assert.doesNotMatch(
    analysis,
    /for \(const source of types\.values\(\)\)[\s\S]*for \(const target of types\.values\(\)\)/u,
  );

  const planner = readFileSync(
    resolve(repositoryRoot, "src/backend/planner/expressions/conversions.ts"),
    "utf8",
  );
  assert.match(planner, /program\.conversions\.select/u);
  assert.doesNotMatch(planner, /selectCsharp(?:Expression)?Conversion/u);
});

test("C# runtime-reference construction has one owner and preserves core target requirements", () => {
  const helper = readFileSync(
    resolve(repositoryRoot, "src/compilation/runtime-references.ts"),
    "utf8",
  );
  const session = readFileSync(
    resolve(repositoryRoot, "src/compilation/session.ts"),
    "utf8",
  );
  const composition = readFileSync(
    resolve(repositoryRoot, "src/compilation/composition.ts"),
    "utf8",
  );

  assert.match(helper, /export function csharpRuntimeAssemblyReference/u);
  assert.doesNotMatch(session, /function csharpRuntimeAssemblyReference/u);
  assert.doesNotMatch(composition, /function csharpRuntimeAssemblyReference/u);
  assert.match(session, /"@tsonic\/csharp-runtime"/u);
  assert.match(session, /"@tsonic\/csharp-js"/u);
  assert.doesNotMatch(composition, /"@tsonic\/csharp-js"/u);
  assert.doesNotMatch(composition, /"@tsonic\/csharp-runtime"/u);
});

function awaitRuntimeExports(relativePath) {
  return import(new URL(`../../${relativePath}`, import.meta.url));
}

function sourceSection(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0, `missing source marker ${startMarker}`);
  assert.ok(end > start, `missing source marker ${endMarker}`);
  return text.slice(start, end);
}
