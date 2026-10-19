import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { csharpProviderPolicyContributionKind } from "../../../dist/target-model/metadata/provider-metadata.js";
import { csharpProviderPolicyContribution } from "../../../dist/providers/model/provider-policy-contribution.js";
import * as publicProvider from "../../../dist/public/provider.js";

test("C404 provider contribution metadata has one canonical target-model owner and unchanged public identity", () => {
  assert.equal(publicProvider.csharpProviderPolicyContributionKind, csharpProviderPolicyContributionKind);
  assert.equal(publicProvider.csharpProviderPolicyContribution, csharpProviderPolicyContribution);
  assert.equal(csharpProviderPolicyContributionKind, "csharp-provider-policy");
  const owner = readFileSync(new URL("../../../src/target-model/metadata/provider-metadata.ts", import.meta.url), "utf8");
  for (const name of ["CsharpTargetBinaryExecutionDriver", "CsharpProviderPolicyContribution"])
    assert.equal(owner.includes(`export interface ${name}`), true, name);
  assert.equal(owner.includes("CsharpProviderBinaryExecutionDriver"), false, "the superseded driver synonym has no declaration or field use");
  const publicTypes = readFileSync(new URL("../../../src/public/provider.ts", import.meta.url), "utf8");
  assert.equal(publicTypes.includes("CsharpProviderBinaryExecutionDriver"), false, "the superseded driver name is not re-exported");
  assert.equal(publicTypes.includes("CsharpTargetBinaryExecutionDriver"), true, "the canonical driver is publicly exported from its sole owner");
  const oldTypes = readFileSync(new URL("../../../src/target-model/types/model.ts", import.meta.url), "utf8");
  assert.equal(oldTypes.includes("export interface CsharpTargetBinaryExecutionDriver"), false);
  const oldContribution = readFileSync(new URL("../../../src/providers/model/provider-policy-contribution.ts", import.meta.url), "utf8");
  assert.equal(oldContribution.includes("export interface CsharpProviderPolicyContribution"), false);
  assert.equal(/export\s+(?:type\s+)?\{[^}]*CsharpProviderPolicyContribution/.test(oldContribution), false);
});

test("C404 source identities and rejection evidence have one target-model owner without provider aliases", () => {
  const owner = readFileSync(new URL("../../../src/target-model/identities/provider-relations.ts", import.meta.url), "utf8");
  for (const declaration of ["export type CsharpProviderSourceIdentity", "export interface CsharpProviderTargetRejection", "export interface CsharpProviderTargetRejectionDiagnostic"])
    assert.equal(owner.includes(declaration), true, declaration);
  const old = readFileSync(new URL("../../../src/providers/model/provider-relations.ts", import.meta.url), "utf8");
  assert.equal(old.includes("export type CsharpProviderSourceIdentity"), false);
  assert.equal(old.includes("export interface CsharpProviderTargetRejection"), false);
  assert.equal(old.includes("export interface CsharpProviderTargetRejectionDiagnostic"), false);
});
