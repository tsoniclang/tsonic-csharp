import type { TargetCapabilityContribution } from "@tsonic/target-api/provider";
import type { CsharpProviderTargetRejection } from "../../target-model/identities/provider-relations.js";
import type { CsharpProviderTargetRelation } from "../../target-model/identities/provider-relations.js";
import type { CsharpTargetBindingFact } from "../../target-model/types/model.js";
import { csharpProviderPolicyContributionKind, type CsharpProviderPolicyContribution } from "../../target-model/metadata/provider-metadata.js";
import type { CsharpTargetBinaryExecutionDriver } from "../../target-model/types/model.js";
import { hasExactContributionFields, isContributionRecord, nonEmptyContributionString } from "./contribution-values.js";
import { snapshotCsharpMetadata } from "../../target-model/metadata/immutable.js";
import type { CsharpNativeDeclaration } from "../../target-model/types/native-declarations.js";
import { snapshotCsharpNativeDeclaration } from "../../target-model/types/native-declaration-operations.js";

export function csharpProviderPolicyContribution(
  input: {
    readonly providerId: string;
    readonly providerVersion: string;
    readonly targetBindings: readonly CsharpTargetBindingFact[];
    readonly nativeDeclarations: readonly CsharpNativeDeclaration[];
    readonly relations: readonly CsharpProviderTargetRelation[];
    readonly rejections: readonly CsharpProviderTargetRejection[];
    readonly binaryExecutionDriver?: CsharpTargetBinaryExecutionDriver;
  },
): CsharpProviderPolicyContribution {
  if (
    arguments.length !== 1 ||
    !isContributionRecord(input) ||
    !hasExactContributionFields(input, [
      "providerId",
      "providerVersion",
      "targetBindings",
      "nativeDeclarations",
      "relations",
      "rejections",
      "binaryExecutionDriver",
    ]) ||
    !nonEmptyContributionString(input.providerId) ||
    !nonEmptyContributionString(input.providerVersion) ||
    !Array.isArray(input.targetBindings) ||
    !Array.isArray(input.nativeDeclarations) ||
    !Array.isArray(input.relations) ||
    !Array.isArray(input.rejections)
  ) {
    throw new Error(
      "C# provider policy contributions require one object containing providerId, providerVersion, targetBindings, nativeDeclarations, relations and rejections.",
    );
  }
  return snapshotCsharpMetadata({
    kind: csharpProviderPolicyContributionKind,
    ...input,
    nativeDeclarations: completeProviderDeclarations(input.nativeDeclarations, input.targetBindings),
  });
}

export function validateCsharpProviderPolicyContribution(
  capabilityId: string,
  moduleOwnership: readonly { readonly specifierPrefix: string }[],
  contribution: TargetCapabilityContribution,
): CsharpProviderPolicyContribution {
  if (
    !isContributionRecord(contribution) ||
    !hasExactContributionFields(contribution, [
      "kind",
      "providerId",
      "providerVersion",
      "targetBindings",
      "nativeDeclarations",
      "relations",
      "rejections",
      "binaryExecutionDriver",
    ]) ||
    !nonEmptyContributionString(contribution.providerId) ||
    !nonEmptyContributionString(contribution.providerVersion) ||
    !Array.isArray(contribution.targetBindings) ||
    !Array.isArray(contribution.nativeDeclarations) ||
    !Array.isArray(contribution.relations) ||
    !Array.isArray(contribution.rejections)
  ) {
    throw new Error(
      `C# target capability '${capabilityId}' supplied an invalid '${csharpProviderPolicyContributionKind}' contribution.`,
    );
  }
  const snapshot = snapshotCsharpMetadata(contribution) as unknown as
    CsharpProviderPolicyContribution;
  for (const binding of snapshot.targetBindings) {
    if (
      !isContributionRecord(binding) ||
      binding.target !== "csharp" ||
      !nonEmptyContributionString(binding.id) ||
      !nonEmptyContributionString(binding.sourceName) ||
      !nonEmptyContributionString(binding.targetName) ||
      !["class", "struct", "interface", "trait", "enum", "delegate", "function", "opaque"].includes(String(binding.kind))
    ) {
      throw new Error(
        `C# target capability '${capabilityId}' supplied an invalid physical target binding.`,
      );
    }
  }
  for (const relation of snapshot.relations) {
    validateCsharpProviderRelation(
      capabilityId,
      moduleOwnership,
      snapshot.providerId,
      snapshot.providerVersion,
      relation,
    );
  }
  for (const rejection of snapshot.rejections) {
    validateCsharpProviderRejection(
      capabilityId,
      moduleOwnership,
      snapshot.providerId,
      snapshot.providerVersion,
      rejection,
    );
  }
  const driver = snapshot.binaryExecutionDriver;
  if (driver !== undefined) {
    if (
      !isContributionRecord(driver) ||
      !hasExactContributionFields(driver, [
        "id",
        "declaringType",
        "runMethodName",
        "runWithEntrypointMethodName",
      ]) ||
      !nonEmptyContributionString(driver.id) ||
      !nonEmptyContributionString(driver.runMethodName) ||
      !nonEmptyContributionString(driver.runWithEntrypointMethodName) ||
      !isContributionRecord(driver.declaringType)
    ) {
      throw new Error(
        `C# target capability '${capabilityId}' supplied an invalid binary execution driver.`,
      );
    }
  }
  return Object.freeze({ ...snapshot,
    nativeDeclarations: completeProviderDeclarations(snapshot.nativeDeclarations, snapshot.targetBindings) });
}

function completeProviderDeclarations(
  declarations: readonly CsharpNativeDeclaration[], bindings: readonly CsharpTargetBindingFact[],
): readonly CsharpNativeDeclaration[] {
  const completed = Object.freeze(declarations.map(snapshotCsharpNativeDeclaration));
  const identities = new Set(completed.map(definition => definition.carrier.id));
  if (identities.size !== completed.length) {
    throw new TypeError("A C# provider declares each original Native physical type exactly once.");
  }
  for (const binding of bindings) {
    const type = binding.csharpType;
    const named = type === undefined
      ? ["class", "struct", "interface", "enum", "delegate"].includes(binding.kind)
      : type.kind === "target-named";
    if (named && !identities.has(type?.kind === "target-named" ? type.id : binding.id)) {
      throw new TypeError("A C# provider's owned named binding requires its complete original Native declaration.");
    }
  }
  return completed;
}

function validateCsharpProviderRejection(
  capabilityId: string,
  moduleOwnership: readonly { readonly specifierPrefix: string }[],
  providerId: string,
  providerVersion: string,
  rejection: CsharpProviderTargetRejection,
): void {
  if (
    !isContributionRecord(rejection) ||
    !hasExactContributionFields(rejection, ["source", "diagnostic"]) ||
    !isValidCsharpProviderSource(
      rejection.source,
      moduleOwnership,
      providerId,
      providerVersion,
    ) ||
    !isValidProviderRejectionDiagnostic(rejection.diagnostic)
  ) {
    throw new Error(
      `C# target capability '${capabilityId}' supplied an invalid provider rejection.`,
    );
  }
}

function isValidProviderRejectionDiagnostic(value: unknown): boolean {
  return isContributionRecord(value) &&
    hasExactContributionFields(value, [
      "extensionId",
      "extensionCode",
      "numericCode",
      "category",
      "message",
      "evidence",
    ]) &&
    value.category === "error" &&
    nonEmptyContributionString(value.extensionId) &&
    nonEmptyContributionString(value.extensionCode) &&
    Number.isSafeInteger(value.numericCode) &&
    Number(value.numericCode) > 0 &&
    nonEmptyContributionString(value.message) &&
    (
      value.evidence === undefined ||
      Array.isArray(value.evidence) && value.evidence.every((entry) =>
        isContributionRecord(entry) &&
        hasExactContributionFields(entry, ["message"]) &&
        nonEmptyContributionString(entry.message)
      )
    );
}

function validateCsharpProviderRelation(
  capabilityId: string,
  moduleOwnership: readonly { readonly specifierPrefix: string }[],
  providerId: string,
  providerVersion: string,
  relation: CsharpProviderTargetRelation,
): void {
  if (
    !isContributionRecord(relation) ||
    !["type", "value", "member", "signature"].includes(String(relation.kind)) ||
    !isValidCsharpProviderSource(
      relation.source,
      moduleOwnership,
      providerId,
      providerVersion,
    ) ||
    relation.source.kind !== relation.kind ||
    !isContributionRecord(relation.targetBinding) ||
    relation.targetBinding.target !== "csharp" ||
    !nonEmptyContributionString(relation.targetBinding.id)
  ) {
    throw new Error(
      `C# target capability '${capabilityId}' supplied an invalid provider relation.`,
    );
  }
  if (
    relation.kind !== "type" &&
    (
      !isContributionRecord(relation.targetMember) ||
      !nonEmptyContributionString(relation.targetMember.id)
    )
  ) {
    throw new Error(
      `C# target capability '${capabilityId}' supplied a provider ${relation.kind} relation without an exact target member.`,
    );
  }
  if (
    relation.kind === "type" &&
    relation.objectLiteralConstruction !== undefined &&
    (
      !isContributionRecord(relation.objectLiteralConstruction) ||
      !hasExactContributionFields(
        relation.objectLiteralConstruction,
        ["kind"],
      ) ||
      relation.objectLiteralConstruction.kind !== "object-initializer"
    )
  ) {
    throw new Error(
      `C# target capability '${capabilityId}' supplied an invalid provider object-literal construction contract.`,
    );
  }
}

function isValidCsharpProviderSource(
  source: unknown,
  moduleOwnership: readonly { readonly specifierPrefix: string }[],
  providerId: string,
  providerVersion: string,
): source is CsharpProviderTargetRelation["source"] {
  return isContributionRecord(source) &&
    ["type", "value", "member", "signature"].includes(String(source.kind)) &&
    source.providerId === providerId &&
    source.providerVersion === providerVersion &&
    nonEmptyContributionString(source.providerModuleId) &&
    nonEmptyContributionString(source.moduleSpecifier) &&
    nonEmptyContributionString(source.exportId) &&
    nonEmptyContributionString(source.exportName) &&
    moduleOwnership.some((ownership) =>
      String(source.moduleSpecifier).startsWith(ownership.specifierPrefix));
}
