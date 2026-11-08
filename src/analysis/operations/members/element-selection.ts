import type { ExtensionDiagnostic, Node, SourceFile } from "@tsonic/tsts";
import type { SourceMemberUse } from "@tsonic/target-api/source";
import type { CsharpProviderTargetRelation } from "../../../target-model/identities/provider-relations.js";
import type { TargetTypeRef } from "../../../target-model/types/native-type-data.js";
import type { CsharpTargetMember } from "../../../target-model/types/model.js";
import type { CsharpRepresentationOutcome } from "../../../target-model/types/representation.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { instantiateCsharpProviderBindingMember } from "./calls/binding-instantiation.js";
import type { CsharpProviderCallSelectionHost } from "../../../policy/model/provider-calls.js";
import { resolveCsharpProviderMemberRelations } from "./relations.js";
import { selectCsharpNativeIndexConversion } from "../../../policy/conversions/native-index.js";
import type { CsharpTargetElementSelection } from "../../../target-model/records/operations/member-selections.js";
import { providerReceiverMatchesElement, csharpProviderElementSupportsAccess } from "../../../policy/operations/members/element-selection.js";
import { represented } from "../../../policy/types/source-type-flow/representation-results.js";

type CsharpProviderSignatureRelation = Extract<CsharpProviderTargetRelation, { readonly kind: "signature" }>;

export interface CsharpSelectedProviderElement {
  readonly source: SourceMemberUse;
  readonly relation: CsharpProviderSignatureRelation;
  readonly targetMember: CsharpTargetMember;
  readonly targetParameterIndex: number;
  readonly indexConversion?: Extract<CsharpTargetElementSelection, { readonly kind: "resolved" }>["indexConversion"];
}

export type CsharpProviderElementSelection =
  | { readonly kind: "resolved"; readonly element: CsharpSelectedProviderElement }
  | { readonly kind: "not-provider"; readonly source: SourceMemberUse; readonly reason: string }
  | { readonly kind: "missing" | "conflict"; readonly reason: string }
  | { readonly kind: "ambiguous"; readonly reason: string; readonly candidates: readonly string[] }
  | { readonly kind: "rejected"; readonly diagnostic: ExtensionDiagnostic }
  | Exclude<CsharpRepresentationOutcome<never>, { readonly kind: "represented" }>;

export function selectCsharpProviderElement(
  host: CsharpProviderCallSelectionHost, elementAccess: Node, _sourceFile: SourceFile,
): CsharpProviderElementSelection {
  const publication = host.facts.objects.use(elementAccess);
  if (publication.kind === "refused") return Object.freeze({ kind: "source-refused", refusal: publication });
  const source = publication.value;
  const resolution = resolveCsharpProviderMemberRelations(host, source);
  if (resolution.kind === "missing") return { kind: "not-provider", source, reason: resolution.reason };
  if (resolution.kind !== "resolved") return resolution;
  const candidates: CsharpSelectedProviderElement[] = [];
  for (const relation of resolution.relations) {
    if (relation.kind !== "signature") continue;
    const candidate = instantiateProviderElement(host, relation, source);
    if (candidate.kind !== "represented") return candidate;
    if (candidate.value !== undefined) candidates.push(candidate.value);
  }
  if (candidates.length === 1) return Object.freeze({ kind: "resolved", element: candidates[0]! });
  return candidates.length === 0 ? { kind: "missing",
    reason: "No related C# provider indexer satisfies the exact selected element access." }
    : { kind: "ambiguous",
      reason: "More than one C# target indexer satisfies the same exact selected provider element access.",
      candidates: candidates.map(candidate => `${candidate.relation.targetBinding.id}::${candidate.targetMember.id}`) };
}

function instantiateProviderElement(
  host: CsharpProviderCallSelectionHost, relation: CsharpProviderSignatureRelation, source: SourceMemberUse,
): CsharpRepresentationOutcome<CsharpSelectedProviderElement | undefined> {
  if (relation.targetMember.kind !== "indexer" || relation.methodTypeParameters.length !== 0 ||
    relation.parameters.length !== 1 || source.key.kind !== "present") return represented(undefined);
  const parameterRelation = relation.parameters[0]!;
  if (parameterRelation.sourceParameterIndex !== 0 || parameterRelation.sourcePassingMode !== "by-value" ||
    parameterRelation.sourceAcceptsOmission || parameterRelation.sourceRest) return represented(undefined);
  const carriers: TargetTypeRef[] = [];
  if ((relation.targetBinding.typeParameters?.length ?? 0) !== 0) {
    const receiver = host.nativeValue(source.receiver.occurrence);
    if (receiver.kind !== "represented") return receiver;
    carriers.push(receiver.value);
  }
  const targetMember = instantiateCsharpProviderBindingMember(relation.targetBinding, relation.targetMember,
    relation.bindingTypeParameters, carriers);
  if (targetMember === undefined) return represented(undefined);
  const targetParameter = targetMember.parameters[parameterRelation.targetParameterIndex];
  if (targetParameter === undefined || targetParameter.passingMode !== parameterRelation.targetPassingMode ||
    !providerReceiverMatchesElement(relation, source) ||
    !csharpProviderElementSupportsAccess(targetMember, source.access)) return represented(undefined);
  const operand = source.key.value;
  const key = host.nativeValue(operand.occurrence);
  if (key.kind !== "represented") return key;
  if (targetTypeRefEquals(key.value, targetParameter.type)) return represented(Object.freeze({
    source, relation, targetMember, targetParameterIndex: parameterRelation.targetParameterIndex }));
  const conversion = selectCsharpNativeIndexConversion(host.facts.descriptors, operand,
    { kind: "index", occurrence: operand.occurrence, type: targetParameter.type, passingMode: targetParameter.passingMode },
    key.value, targetParameter.type);
  return conversion === undefined ? represented(undefined) : represented(Object.freeze({
    source, relation, targetMember, targetParameterIndex: parameterRelation.targetParameterIndex,
    indexConversion: Object.freeze({ source: key.value, target: targetParameter.type, selection: conversion }),
  }));
}
