import type { SourceCallSelection } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";

import type { CsharpProviderTargetRelation } from "../../../../target-model/identities/provider-relations.js";
import type { CsharpTargetMember } from "../../../../policy/types/index.js";

import { csharpTargetParameterValueType, csharpTargetStorageIdentityEquals, targetTypeRefKey } from "../../../../policy/types/index.js";
import { selectCsharpProviderArgumentConversion } from "../../../../policy/conversions/index.js";
import { csharpConversionIsApplicable } from "../../../../policy/conversions/applicability.js";
import { selectCsharpSourceTypeFlowIndexConversion } from "../../../../policy/conversions/source-type-flow-index.js";
import { csharpIntegralConversionAnnotationHint } from "../../../conversions/integral-hints.js";

import { selectCsharpSourceArgument } from "../../../../source/extension/arguments.js";
import type { CsharpSelectedCallArgument, CsharpProviderArgumentMapping } from "../../../../target-model/records/objects/members.js";

type CsharpProviderSignatureRelation = Extract<
  CsharpProviderTargetRelation,
  { readonly kind: "signature" }
>;

import type { CsharpProviderCallInstantiationHost } from "../../../../policy/model/provider-calls.js";
import { everyRequiredTargetParameterIsSupplied } from "../../../../policy/operations/members/instantiation-arguments.js";
type CsharpProviderArgumentValidation =
  | {
      readonly kind: "accepted";
      readonly argumentMappings: readonly CsharpProviderArgumentMapping[];
    }
  | { readonly kind: "rejected"; readonly reason: string };

export function validateArgumentsTargetSelectedParameters(
  host: CsharpProviderCallInstantiationHost,
  relation: CsharpProviderSignatureRelation,
  targetMember: CsharpTargetMember,
  source: SourceCallSelection,
  arguments_: readonly CsharpSelectedCallArgument[],
): CsharpProviderArgumentValidation {
  const argumentMappings: CsharpProviderArgumentMapping[] = [];
  for (const argument of arguments_) {
    // The effective argument index is the position in the Host argument correspondence (selections.call).
    const sourceExpression = source.arguments[argument.effectiveArgumentIndex]?.argument ?? failTargetAnalysisInvariant(
      "tsonic-csharp", `Effective source argument ${argument.effectiveArgumentIndex} has no Host argument correspondence.`, source.use);
    const binding = { sourceArgumentIndex: argument.sourceArgumentIndex };
    const sourceArgument = selectCsharpSourceArgument(
      host.sourceFacts,
      sourceExpression,
    );
    if (sourceArgument.kind === "rejected") {
      return {
        kind: "rejected",
        reason:
          `Source argument ${binding.sourceArgumentIndex} is invalid. ${sourceArgument.reason}`,
      };
    }
    if (
      sourceArgument.argument.passingMode !==
        argument.targetParameter.passingMode
    ) {
      return {
        kind: "rejected",
        reason:
          `Source argument ${binding.sourceArgumentIndex} uses '${sourceArgument.argument.passingMode}', but exact target parameter '${argument.targetParameter.name}' requires '${argument.targetParameter.passingMode}'.`,
      };
    }
    const sourceSelection = host.types.value(sourceArgument.argument.storageExpression);
    const sourceType = sourceSelection.kind === "csharp-refused" ? undefined : sourceSelection;
    const targetType = csharpTargetParameterValueType(
      argument.targetParameter,
      argument.sourceForm,
    );
    if (sourceType === undefined) {
      if (
        argument.targetParameter.csharpAcceptsCheckedSourceArgument === true &&
        sourceArgument.argument.passingMode === "by-value"
      ) {
        argumentMappings.push({
          kind: "checked-source",
          effectiveArgumentIndex: argument.effectiveArgumentIndex,
          targetType,
          proof: "selected-provider-signature",
        });
        continue;
      }
      return {
        kind: "rejected",
        reason:
          `Source argument ${binding.sourceArgumentIndex} has no closed C# representation for its exact selected target parameter '${argument.targetParameter.name}'.`,
      };
    }
    const parameterRelation = relation.parameters.find((candidate) =>
      candidate.targetParameterIndex === argument.targetParameterIndex);
    if (sourceArgument.argument.passingMode !== "by-value") {
      if (!csharpTargetStorageIdentityEquals(sourceType, targetType)) {
        return {
          kind: "rejected",
          reason:
            `Source argument ${binding.sourceArgumentIndex} with C# representation '${targetTypeRefKey(sourceType)}' cannot satisfy exact target parameter '${argument.targetParameter.name}' with passing mode '${sourceArgument.argument.passingMode}' and representation '${targetTypeRefKey(targetType)}'. Exact C# by-reference passing requires one CLR storage identity; nullable-reference annotations may differ, but the underlying storage type may not.`,
        };
      }
      argumentMappings.push({
        kind: "by-reference",
        effectiveArgumentIndex: argument.effectiveArgumentIndex,
        sourceType,
        targetType,
        passingMode: sourceArgument.argument.passingMode,
        proof: "storage-identity",
      });
      continue;
    }
    const conversion = selectCsharpSourceTypeFlowIndexConversion(host.facts.values.type(sourceArgument.argument.storageExpression),
      { kind: "parameter", expression: sourceArgument.argument.storageExpression, parameter: argument.targetParameter }, sourceType, targetType)
      ?? selectCsharpProviderArgumentConversion(
      host,
      sourceArgument.argument.storageExpression,
      sourceType,
      targetType,
      parameterRelation?.argumentAdapter,
    );
    if (!csharpConversionIsApplicable(conversion, "implicit")) {
      if (
        argument.targetParameter.csharpAcceptsCheckedSourceArgument === true
      ) {
        argumentMappings.push({
          kind: "checked-source",
          effectiveArgumentIndex: argument.effectiveArgumentIndex,
          targetType,
          proof: "selected-provider-signature",
        });
        continue;
      }
      const detail = conversion.kind === "rejected" ||
          conversion.kind === "ambiguous"
        ? ` ${conversion.reason}`
        : "";
      const hint = csharpIntegralConversionAnnotationHint(sourceArgument.argument.storageExpression, sourceType, targetType,
        { ast: host.ast, facts: host.facts });
      return {
        kind: "rejected",
        reason:
          `Source argument ${binding.sourceArgumentIndex} with C# representation '${targetTypeRefKey(sourceType)}' cannot satisfy exact target parameter '${argument.targetParameter.name}' with passing mode '${sourceArgument.argument.passingMode}' and representation '${targetTypeRefKey(csharpTargetParameterValueType(argument.targetParameter, argument.sourceForm))}'.${detail}${hint === undefined ? "" : ` ${hint}`}`,
      };
    }
    argumentMappings.push({
      kind: "by-value",
      effectiveArgumentIndex: argument.effectiveArgumentIndex,
      sourceType,
      targetType,
      conversion,
    });
  }
  if (!everyRequiredTargetParameterIsSupplied(
    targetMember,
    arguments_,
    relation.receiver,
  )) {
    return {
      kind: "rejected",
      reason:
        `The selected source call does not supply every required parameter of exact target member '${targetMember.id}'.`,
    };
  }
  return {
    kind: "accepted",
    argumentMappings: Object.freeze(argumentMappings),
  };
}
