import type { SourceApplication, SourceArgumentPlace } from "@tsonic/target-api/source";
import type { CsharpProviderTargetRelation } from "../../../../target-model/identities/provider-relations.js";
import type { TargetTypeRef } from "../../../../target-model/types/native-type-data.js";
import type { CsharpTargetMember } from "../../../../target-model/types/model.js";
import type { CsharpRepresentationOutcome } from "../../../../target-model/types/representation.js";
import type { CsharpSelectedCallArgument, CsharpProviderArgumentMapping } from "../../../../target-model/records/objects/members.js";
import type { CsharpProviderCallInstantiationHost } from "../../../../policy/model/provider-calls.js";
import { csharpTargetParameterValueType, csharpTargetStorageIdentityEquals, targetTypeRefKey } from "../../../../policy/types/index.js";
import { getCsharpArrayLiteralElementTargetType } from "../../../../target-model/types/carriers/collections.js";
import { selectCsharpProviderArgumentConversion } from "../../../../policy/conversions/expression.js";
import { csharpConversionIsApplicable } from "../../../../policy/conversions/applicability.js";
import { admitCsharpSourceConversion } from "../../../../policy/conversions/source-admission.js";
import { selectCsharpNativeIndexConversion } from "../../../../policy/conversions/native-index.js";
import { selectCsharpSourceArgument } from "../../../../source/extension/arguments.js";
import { everyRequiredTargetParameterIsSupplied } from "../../../../policy/operations/members/instantiation-arguments.js";

type SignatureRelation = Extract<CsharpProviderTargetRelation, { readonly kind: "signature" }>;

export function csharpApplicationArgumentCarrier(
  host: CsharpProviderCallInstantiationHost, application: SourceApplication, binding: SourceArgumentPlace,
): CsharpRepresentationOutcome<TargetTypeRef> {
  const authored = application.sourceArguments[binding.sourceArgumentIndex];
  if (authored === undefined || authored.occurrence !== binding.sourceArgument) {
    throw new TypeError("A Native argument requires its identical canonical authored Source evaluation.");
  }
  const selection = selectCsharpSourceArgument(host.facts.protocols, authored.operand.occurrence);
  if (selection.kind === "refused") return Object.freeze({ kind: "source-refused", refusal: selection });
  const passing = selection.argument;
  const selected = host.nativeValue(passing.storageExpression);
  if (selected.kind !== "represented") return selected;
  if (binding.sourceForm !== "spread-element") return selected;
  if (passing.passingMode !== "by-value" || binding.spreadElementIndex === undefined) {
    return refused(application, "Tuple-spread extraction requires a by-value original operand and its exact published element position.");
  }
  const carrier = selected.value.kind === "tuple" ? selected.value.elements[binding.spreadElementIndex]
    : getCsharpArrayLiteralElementTargetType(selected.value);
  return carrier === undefined ? refused(application, "The actual Native spread storage has no physical slot for the published Source tuple element.")
    : Object.freeze({ kind: "represented", value: carrier });
}

export function validateArgumentsTargetSelectedParameters(
  host: CsharpProviderCallInstantiationHost, relation: SignatureRelation, targetMember: CsharpTargetMember,
  source: SourceApplication, arguments_: readonly CsharpSelectedCallArgument[],
): CsharpRepresentationOutcome<readonly CsharpProviderArgumentMapping[]> {
  const mappings: CsharpProviderArgumentMapping[] = [];
  for (const argument of arguments_) {
    const binding = source.arguments.find(candidate => candidate.effectiveArgumentIndex === argument.effectiveArgumentIndex);
    if (binding === undefined || binding.parameter.signature !== source.identity.signature) {
      return refused(source, "Every Native parameter requires its exact original Source argument place and selected signature.");
    }
    const authored = source.sourceArguments[binding.sourceArgumentIndex];
    if (authored === undefined) return refused(source, "The effective argument has no original authored evaluation operand.");
    const selection = selectCsharpSourceArgument(host.facts.protocols, authored.operand.occurrence);
    if (selection.kind === "refused") return Object.freeze({ kind: "source-refused", refusal: selection });
    const passing = selection.argument;
    if (passing.passingMode !== argument.targetParameter.passingMode) return refused(source,
      `Source argument ${binding.sourceArgumentIndex} uses '${passing.passingMode}', but Native parameter '${argument.targetParameter.name}' requires '${argument.targetParameter.passingMode}'.`);
    const selected = csharpApplicationArgumentCarrier(host, source, binding);
    if (selected.kind !== "represented") return selected;
    const sourceType = selected.value;
    const targetType = csharpTargetParameterValueType(argument.targetParameter, argument.sourceForm);
    if (passing.passingMode !== "by-value") {
      if (!csharpTargetStorageIdentityEquals(sourceType, targetType)) return refused(source,
        `Native by-reference argument '${argument.targetParameter.name}' requires one CLR storage identity, not '${targetTypeRefKey(sourceType)}' versus '${targetTypeRefKey(targetType)}'.`);
      mappings.push(Object.freeze({ kind: "by-reference", effectiveArgumentIndex: binding.effectiveArgumentIndex,
        sourceType, targetType, passingMode: passing.passingMode, proof: "storage-identity" }));
      continue;
    }
    const operand = { occurrence: binding.effectiveArgument, value: binding.source };
    const index = selectCsharpNativeIndexConversion(host.facts.descriptors, operand,
      { kind: "parameter", occurrence: binding.effectiveArgument, type: targetType, passingMode: argument.targetParameter.passingMode }, sourceType, targetType);
    const parameterRelation = relation.parameters.find(candidate => candidate.targetParameterIndex === argument.targetParameterIndex);
    const preliminary = index ?? selectCsharpProviderArgumentConversion(host, binding.effectiveArgument, sourceType,
      targetType, parameterRelation?.argumentAdapter, host.facts.descriptors.scalarLiteral(binding.source));
    if (!csharpConversionIsApplicable(preliminary, "implicit")) return refused(source,
      `Argument ${binding.sourceArgumentIndex} with Native carrier '${targetTypeRefKey(sourceType)}' cannot satisfy '${argument.targetParameter.name}' with carrier '${targetTypeRefKey(targetType)}'.${preliminary.kind === "rejected" || preliminary.kind === "ambiguous" ? " " + preliminary.reason : ""}`);
    const admitted = admitCsharpSourceConversion({ representation: host.representation, relation: preliminary,
      source: { evidence: binding.source, carrier: sourceType },
      destination: { evidence: binding.destination.applied, carrier: targetType }, site: binding.effectiveArgument });
    if (admitted.kind !== "represented") return admitted;
    mappings.push(Object.freeze({ kind: "by-value", effectiveArgumentIndex: binding.effectiveArgumentIndex,
      sourceType, targetType, conversion: admitted.value }));
  }
  return everyRequiredTargetParameterIsSupplied(targetMember, arguments_, relation.receiver)
    ? Object.freeze({ kind: "represented", value: Object.freeze(mappings) })
    : refused(source, `The selected Source application does not supply every required parameter of Native member '${targetMember.id}'.`);
}

function refused(application: SourceApplication, message: string): Exclude<CsharpRepresentationOutcome<never>, { readonly kind: "represented" }> {
  return Object.freeze({ kind: "native-refused", source: "tsonic-csharp", code: "CSHARP_PROVIDER_ARGUMENT_NOT_PROVEN",
    site: application.identity.invocation, message });
}
