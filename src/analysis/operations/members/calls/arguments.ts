import type { SourceFile } from "@tsonic/tsts";

import type { CsharpProviderTargetRelation } from "../../../../target-model/identities/provider-relations.js";
import type { CsharpTargetMember } from "../../../../policy/types/index.js";

import { csharpTargetParameterValueType, csharpTargetStorageIdentityEquals, targetTypeRefKey } from "../../../../policy/types/index.js";
import { selectCsharpProviderArgumentConversion } from "../../../../policy/conversions/index.js";
import { csharpConversionIsApplicable } from "../../../../policy/conversions/applicability.js";

import { selectCsharpSourceArgument } from "../../../../source/extension/arguments.js";
import type { CsharpSelectedCallArgument, CsharpProviderArgumentMapping } from "../../../../target-model/records/members.js";
import type { ResolvedSourceCallInfo } from "../../../../target-model/records/source-calls.js";

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
  source: ResolvedSourceCallInfo,
  arguments_: readonly CsharpSelectedCallArgument[],
  sourceFile: SourceFile,
): CsharpProviderArgumentValidation {
  const argumentMappings: CsharpProviderArgumentMapping[] = [];
  for (const argument of arguments_) {
    const binding = source.sourceArgumentBindings.find((candidate) =>
      candidate.effectiveArgumentIndex === argument.effectiveArgumentIndex);
    if (binding === undefined) {
      return {
        kind: "rejected",
        reason:
          `Effective source argument ${argument.effectiveArgumentIndex} has no exact checker-selected parameter binding.`,
      };
    }
    const sourceExpression = source.sourceArguments[
      binding.sourceArgumentIndex
    ]?.expression;
    if (sourceExpression === undefined) {
      return {
        kind: "rejected",
        reason:
          `Source argument ${binding.sourceArgumentIndex} has no exact checker-owned expression.`,
      };
    }
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
    const sourceSelection = host.types.resolveNode(
      sourceArgument.argument.storageExpression,
      sourceFile,
    );
    const sourceType = sourceSelection?.kind === "rejected" ? undefined : sourceSelection?.type ?? (sourceArgument.argument.passingMode === "by-value"
      ? host.types.resolveType(
          binding.selectedArgumentType,
          sourceFile,
        )
      : undefined);
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
    const conversion = selectCsharpProviderArgumentConversion(
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
      return {
        kind: "rejected",
        reason:
          `Source argument ${binding.sourceArgumentIndex} with C# representation '${targetTypeRefKey(sourceType)}' cannot satisfy exact target parameter '${argument.targetParameter.name}' with passing mode '${sourceArgument.argument.passingMode}' and representation '${targetTypeRefKey(csharpTargetParameterValueType(argument.targetParameter, argument.sourceForm))}'.${detail}`,
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
