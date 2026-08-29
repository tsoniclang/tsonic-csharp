import type { TargetCapabilityContribution } from "@tsonic/target-api/provider";
import type {
  CsharpProviderTargetRejection,
  CsharpProviderTargetRelation,
} from "../relations/index.js";
import type {
  CsharpTargetBinaryExecutionDriver,
} from "../../target-model/types/model.js";
import {
  freezeContributionValue,
  hasExactContributionFields,
  isContributionRecord,
  nonEmptyContributionString,
} from "./contribution-values.js";
import {
  canonicalProviderValue,
} from "./canonical-value.js";

export const csharpProviderPolicyContributionKind = "csharp-provider-policy";

export interface CsharpProviderPolicyContribution
  extends TargetCapabilityContribution {
  readonly kind: typeof csharpProviderPolicyContributionKind;
  readonly providerId: string;
  readonly providerVersion: string;
  readonly relations: readonly CsharpProviderTargetRelation[];
  readonly rejections: readonly CsharpProviderTargetRejection[];
  readonly binaryExecutionDriver?: CsharpProviderBinaryExecutionDriver;
}

export type CsharpProviderBinaryExecutionDriver =
  CsharpTargetBinaryExecutionDriver;

export function composeCsharpBinaryExecutionDriver(
  ...drivers: readonly (CsharpProviderBinaryExecutionDriver | undefined)[]
): CsharpProviderBinaryExecutionDriver | undefined {
  const byId = new Map<string, CsharpProviderBinaryExecutionDriver>();
  for (const driver of drivers) {
    if (driver === undefined) continue;
    const existing = byId.get(driver.id);
    if (existing === undefined) {
      byId.set(driver.id, driver);
      continue;
    }
    if (canonicalProviderValue(existing) !== canonicalProviderValue(driver)) {
      throw new Error(
        `C# target capabilities supplied contradictory binary execution drivers for identity '${driver.id}'.`,
      );
    }
  }
  if (byId.size > 1) {
    throw new Error(
      `C# target capabilities supplied multiple binary execution drivers: ${[...byId.keys()].sort().join(", ")}.`,
    );
  }
  const driver = byId.values().next().value;
  return driver === undefined ? undefined : Object.freeze(driver);
}

export function csharpProviderPolicyContribution(
  providerId: string,
  providerVersion: string,
  relations: readonly CsharpProviderTargetRelation[],
  rejections: readonly CsharpProviderTargetRejection[],
  binaryExecutionDriver?: CsharpProviderBinaryExecutionDriver,
): CsharpProviderPolicyContribution {
  return freezeContributionValue({
    kind: csharpProviderPolicyContributionKind,
    providerId,
    providerVersion,
    relations,
    rejections,
    ...(binaryExecutionDriver === undefined
      ? {}
      : { binaryExecutionDriver }),
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
      "relations",
      "rejections",
      "binaryExecutionDriver",
    ]) ||
    !nonEmptyContributionString(contribution.providerId) ||
    !nonEmptyContributionString(contribution.providerVersion) ||
    !Array.isArray(contribution.relations) ||
    !Array.isArray(contribution.rejections)
  ) {
    throw new Error(
      `C# target capability '${capabilityId}' supplied an invalid '${csharpProviderPolicyContributionKind}' contribution.`,
    );
  }
  const snapshot = freezeContributionValue(contribution) as unknown as
    CsharpProviderPolicyContribution;
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
  return snapshot;
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
