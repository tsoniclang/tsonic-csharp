import type { ExtensionDiagnostic, Node } from "@tsonic/tsts";
import type { SourceElementAccessRecord } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpProviderTargetRelation } from "../../../target-model/identities/provider-relations.js";
import type { CsharpTargetMember } from "../../../policy/types/index.js";
import { targetTypeRefEquals } from "../../../policy/types/index.js";
import { instantiateCsharpProviderBindingMember } from "./calls/binding-instantiation.js";
import type { CsharpProviderCallSelectionHost } from "../../../policy/model/provider-calls.js";
import { resolveCsharpProviderElementRelations } from "./relations.js";
import { selectCsharpSourceTypeFlowIndexConversion } from "../../../policy/conversions/source-type-flow-index.js";
import type { CsharpTargetElementSelection } from "../../../target-model/records/operations/member-selections.js";

type CsharpProviderSignatureRelation = Extract<
  CsharpProviderTargetRelation,
  { readonly kind: "signature" }
>;

import { providerReceiverMatchesElement, csharpProviderElementSupportsAccess } from "../../../policy/operations/members/element-selection.js";
export interface CsharpSelectedProviderElement {
  readonly source: SourceElementAccessRecord;
  readonly relation: CsharpProviderSignatureRelation;
  readonly targetMember: CsharpTargetMember;
  readonly targetParameterIndex: number;
  readonly indexConversion?: Extract<CsharpTargetElementSelection, { readonly kind: "resolved" }>["indexConversion"];
}

export type CsharpProviderElementSelection =
  | {
      readonly kind: "resolved";
      readonly element: CsharpSelectedProviderElement;
    }
  | {
      readonly kind: "not-provider";
      readonly source: SourceElementAccessRecord;
      readonly reason: string;
    }
  | {
      readonly kind: "missing" | "conflict";
      readonly reason: string;
    }
  | {
      readonly kind: "ambiguous";
      readonly reason: string;
      readonly candidates: readonly string[];
    }
  | {
      readonly kind: "rejected";
      readonly diagnostic: ExtensionDiagnostic;
    };

export function selectCsharpProviderElement(
  host: CsharpProviderCallSelectionHost,
  elementAccess: Node,
): CsharpProviderElementSelection {
  const source = host.facts.values.elementAccess(elementAccess);
  const resolution = resolveCsharpProviderElementRelations(host, elementAccess);
  if (resolution.kind === "missing") {
    return {
      kind: "not-provider",
      source,
      reason: resolution.reason,
    };
  }
  if (resolution.kind === "conflict") {
    return { kind: "conflict", reason: resolution.reason };
  }
  if (resolution.kind === "rejected") {
    return resolution;
  }
  const candidates = resolution.relations
    .filter((relation) => relation.kind === "signature")
    .map((relation) =>
      instantiateProviderElement(host, relation, source))
    .filter(
      (candidate): candidate is CsharpSelectedProviderElement =>
        candidate !== undefined,
    );
  if (candidates.length === 1) {
    return { kind: "resolved", element: candidates[0]! };
  }
  if (candidates.length === 0) {
    return {
      kind: "missing",
      reason:
        "No related C# provider indexer satisfies the exact selected element access.",
    };
  }
  return {
    kind: "ambiguous",
    reason:
      "More than one C# target indexer satisfies the same exact selected provider element access.",
    candidates: candidates.map((candidate) =>
      `${candidate.relation.targetBinding.id}::${candidate.targetMember.id}`),
  };
}

function instantiateProviderElement(
  host: CsharpProviderCallSelectionHost,
  relation: CsharpProviderSignatureRelation,
  source: SourceElementAccessRecord,
): CsharpSelectedProviderElement | undefined {
  if (
    relation.targetMember.kind !== "indexer" ||
    relation.methodTypeParameters.length !== 0 ||
    relation.parameters.length !== 1
  ) {
    return undefined;
  }
  const parameterRelation = relation.parameters[0]!;
  if (
    parameterRelation.sourceParameterIndex !== 0 ||
    parameterRelation.sourcePassingMode !== "by-value" ||
    parameterRelation.sourceAcceptsOmission ||
    parameterRelation.sourceRest
  ) {
    return undefined;
  }
  const targetMember = instantiateCsharpProviderBindingMember(
    host.types,
    relation.targetBinding,
    relation.targetMember,
    relation.bindingTypeParameters,
    relation.bindingTypeArgumentSource === "receiver" ||
        relation.bindingTypeArgumentSource === "callee"
      ? [{ node: source.receiver }]
      : [{ node: source.node }],
  );
  const targetParameter = targetMember?.parameters[
    parameterRelation.targetParameterIndex
  ];
  if (
    targetMember === undefined ||
    targetParameter === undefined ||
    targetParameter.passingMode !== parameterRelation.targetPassingMode ||
    !providerReceiverMatchesElement(relation, source) ||
    !csharpProviderElementSupportsAccess(targetMember, source.access)
  ) {
    return undefined;
  }
  if (targetParameter.csharpAcceptsCheckedSourceArgument !== true) {
    const argument = host.ast.as.AsElementAccessExpression(source.node)?.ArgumentExpression ??
      failTargetAnalysisInvariant("tsonic-csharp", "A Host element access record names a node without an index expression.", source.node);
    const sourceArgumentType = host.types.value(argument);
    if (sourceArgumentType.kind === "csharp-refused") return undefined;
    if (!targetTypeRefEquals(sourceArgumentType, targetParameter.type)) {
      const selection: CsharpTargetElementSelection = { kind: "resolved", source, targetMember,
        targetParameterIndex: parameterRelation.targetParameterIndex, receiver: relation.receiver,
        invocation: { kind: "indexer" }, origin: "provider" };
      const conversion = selectCsharpSourceTypeFlowIndexConversion(host.facts.values.type(argument),
        { kind: "element", selection }, sourceArgumentType, targetParameter.type);
      if (conversion !== undefined) return { source, relation, targetMember,
        targetParameterIndex: parameterRelation.targetParameterIndex,
        indexConversion: Object.freeze({ source: sourceArgumentType, target: targetParameter.type, selection: conversion }) };
      return undefined;
    }
  }
  return {
    source,
    relation,
    targetMember,
    targetParameterIndex: parameterRelation.targetParameterIndex,
  };
}
