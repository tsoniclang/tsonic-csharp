import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import {
  evaluateArchitecture,
  formatArchitectureFindings,
} from "../../../tsonic/test/architecture/tooling/architecture-rules.mjs";
import { classifyFiles } from "../../../tsonic/test/architecture/tooling/layer-classification.mjs";
import { buildTypeScriptModuleAnalysis } from "../../../tsonic/test/architecture/tooling/module-graph.mjs";
import { csharpLayerPolicies, csharpLayerRules } from "./layer-policy.mjs";

test("C# packaged-provider model is a provider model, not a source/provider implementation", () => {
  const sources = new Map([
    ["src/providers/packages/model.ts", 'import type { Policy } from "../model/fixture.js"; export interface Package { policy: Policy; }'],
    ["src/providers/model/fixture.ts", "export interface Policy {}"],
    ["src/providers/packages/source-provider.ts", 'import type { Package } from "./model.js"; export function createProvider(input: Package) {}'],
    ["src/target-model/types/fixture.ts", "export interface Type {}"],
    ["src/source/fixture.ts", "export interface Source {}"],
  ]);
  assert.deepEqual(boundaryFindings(sources), []);
  const classification = classifyFiles(sources.keys(), csharpLayerRules);
  assert.equal(classification.classifications.get("src/providers/packages/model.ts"), "provider-model");
  assert.equal(classification.classifications.get("src/providers/packages/source-provider.ts"), "provider-implementation");
  for (const [file, importText, ruleId] of [
    ["src/providers/packages/model.ts", 'import { createProvider } from "./source-provider.js";', "ARCH-PROVIDER-001"],
    ["src/providers/packages/model.ts", 'import type { Source } from "../../source/fixture.js";', "ARCH-PROVIDER-001"],
    ["src/target-model/types/fixture.ts", 'import { createProvider } from "../../providers/packages/source-provider.js";', "ARCH-POLICY-001"],
  ]) {
    const mutated = new Map(sources);
    mutated.set(file, importText);
    assert.ok(boundaryFindings(mutated).some((finding) => finding.source === file && finding.ruleId === ruleId), file);
  }
});

test("the public C# SDK exposes one package factory, not its source-provider machinery", async () => {
  const sdk = await import("../../dist/public/provider.js");
  assert.equal(typeof sdk.createCsharpProviderPackage, "function");
  for (const name of ["createCsharpPackageSourceProvider", "snapshotCsharpProviderPackage", "rebaseProviderExport", "providerImportsForExports"]) {
    assert.equal(Object.hasOwn(sdk, name), false, name);
  }
  const facade = readFileSync(new URL("../../src/public/provider.ts", import.meta.url), "utf8");
  for (const name of ["CsharpProviderPackageDefinition", "CsharpProviderModuleDefinition", "CsharpProviderModuleSpecifier"]) {
    assert.match(facade, new RegExp(`\\b${name}\\b`, "u"));
  }
});

test("C# package transport contains no capability-specific module, surface or runtime data", () => {
  const root = new URL("../../src/providers/packages/", import.meta.url);
  for (const file of readdirSync(root).filter((entry) => entry.endsWith(".ts"))) {
    const source = readFileSync(new URL(file, root), "utf8");
    assert.doesNotMatch(source, /@tsonic\/(?:csharp-nodejs|rust-nodejs)|Tsonic\.CSharp\.Node|["']node:|includeJsSurfaceMembers|\.includes\(["']js["']\)/u, file);
  }
});

function boundaryFindings(sources) {
  const classification = classifyFiles(sources.keys(), csharpLayerRules);
  const modules = buildTypeScriptModuleAnalysis(sources);
  const result = evaluateArchitecture({
    sourceFiles: sources,
    edges: modules.edges,
    classifications: classification.classifications,
    layerPolicies: csharpLayerPolicies,
  });
  assert.deepEqual(classification.findings, [], formatArchitectureFindings(classification.findings));
  return result.findings;
}
