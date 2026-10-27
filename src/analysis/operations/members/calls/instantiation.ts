import type { ReadonlySourceFactResolver, SourceFile } from "@tsonic/tsts";

import type { CsharpProviderTargetRelation } from "../../../../target-model/identities/provider-relations.js";

import { substituteCsharpTargetMember, targetTypeRefEquals } from "../../../../policy/types/index.js";
import { compareCsharpImplicitConversionTargets } from "../../../../policy/conversions/index.js";

import { csharpSourceArgumentPassingMode } from "../../../../source/extension/arguments.js";
import { selectCsharpProviderPointerResult } from "../../pointers/provider-result.js";

import { csharpRuntimeLocationTargetType } from "../../../../target-model/types/carriers/runtime-carriers.js";

import { validateCsharpProviderConstraints } from "./constraint-satisfaction.js";

import type { CsharpProviderArgumentMapping, CsharpSelectedTargetCall } from "../../../../target-model/records/objects/members.js";
import type { ResolvedSourceCallInfo } from "../../../../target-model/records/calls/source-calls.js";

type CsharpProviderSignatureRelation = Extract<
  CsharpProviderTargetRelation,
  { readonly kind: "signature" }
>;

export type CsharpInstantiatedProviderCall = Extract<
  CsharpSelectedTargetCall,
  { readonly origin: "provider" }
>;

export type CsharpProviderCallInstantiation =
  | {
      readonly kind: "resolved";
      readonly call: CsharpInstantiatedProviderCall;
      readonly argumentMappings: readonly CsharpProviderArgumentMapping[];
    }
  | {
      readonly kind: "rejected";
      readonly reason: string;
    };

import type { CsharpProviderCallInstantiationHost } from "../../../../policy/model/provider-calls.js";
import { resolveProviderBindingTypeArguments, resolveMethodTypeArguments, resolveInvocationTypeArguments } from "./type-arguments.js";
import { targetTypeParameterSubstitutions, relateCallArguments } from "../../../../policy/operations/members/instantiation-arguments.js";
import { validateArgumentsTargetSelectedParameters } from "./arguments.js";
export function instantiateCsharpProviderCall(
  host: CsharpProviderCallInstantiationHost,
  relation: CsharpProviderSignatureRelation,
  source: ResolvedSourceCallInfo,
  sourceFile: SourceFile,
): CsharpProviderCallInstantiation {
  const relationError = validateProviderCallRelation(
    host.sourceFacts,
    relation,
    source,
  );
  if (relationError !== undefined) {
    return { kind: "rejected", reason: relationError };
  }
  const bindingArguments = resolveProviderBindingTypeArguments(
    host,
    relation,
    source,
    sourceFile,
  );
  if (bindingArguments === undefined) {
    return {
      kind: "rejected",
      reason:
        "The exact selected receiver/result evidence does not close the provider target binding type parameters.",
    };
  }
  const methodArguments = resolveMethodTypeArguments(
    host,
    relation,
    source,
    sourceFile,
    bindingArguments.map(argument => argument.targetType),
  );
  if (methodArguments === undefined) {
    return {
      kind: "rejected",
      reason:
        "The exact selected method type-argument evidence does not close the provider target method type parameters.",
    };
  }
  const invocationArguments = resolveInvocationTypeArguments(
    host.types,
    relation,
    source,
    sourceFile,
  );
  if (invocationArguments === undefined) {
    return {
      kind: "rejected",
      reason:
        "The exact selected invocation type-argument evidence does not close the provider target invocation.",
    };
  }
  const substitutions = targetTypeParameterSubstitutions(
    relation,
    bindingArguments.map((argument) => argument.targetType),
    methodArguments,
  );
  if (substitutions === undefined) {
    return {
      kind: "rejected",
      reason:
        "Provider binding and method type-parameter identities overlap and cannot be substituted unambiguously.",
    };
  }
  const targetMember = substituteCsharpTargetMember(
    relation.targetMember,
    substitutions,
  );
  const constraintError = validateCsharpProviderConstraints(host, {
    targetBinding: relation.targetBinding,
    bindingArguments,
    targetMember,
    methodArguments,
    invocationArguments,
    sourceFile,
  });
  if (constraintError !== undefined) {
    return { kind: "rejected", reason: constraintError };
  }
  const arguments_ = relateCallArguments(relation, targetMember, source);
  if (arguments_ === undefined) {
    return {
      kind: "rejected",
      reason:
        "The checker-selected source argument slots do not match the provider parameter relation.",
    };
  }
  const argumentValidation = validateArgumentsTargetSelectedParameters(
    host,
    relation,
    targetMember,
    source,
    arguments_,
    sourceFile,
  );
  if (argumentValidation.kind === "rejected") {
    return {
      kind: "rejected",
      reason: argumentValidation.reason,
    };
  }
  const pointerResult = selectCsharpProviderPointerResult(host, source, sourceFile, parameter => {
    const method = parameter.scope === "signature";
    if (method && source.sourceSelectedMethodTypeArguments?.[parameter.index]?.typeParameterName !== parameter.parameter.name) {
      return undefined;
    }
    const mapping = (method ? relation.methodTypeParameters : relation.bindingTypeParameters)
      .find(value => value.sourceTypeParameterIndex === parameter.index);
    return mapping === undefined ? undefined :
      (method ? methodArguments : bindingArguments)[mapping.targetTypeParameterIndex]?.targetType;
  });
  if (pointerResult?.kind === "invalid") return { kind: "rejected", reason: pointerResult.reason };
  const resultCarrier = targetMember.returnType === undefined ? undefined :
    targetMember.csharpReturnPassing === undefined ? targetMember.returnType :
      csharpRuntimeLocationTargetType(targetMember.returnType);
  if (pointerResult !== undefined && (resultCarrier === undefined ||
      !targetTypeRefEquals(pointerResult.carrier, resultCarrier))) {
    return { kind: "rejected", reason: "The provider result conflicts with the canonical source pointer carrier." };
  }
  return {
    kind: "resolved",
    call: {
      relation,
      origin: "provider",
      targetMember,
      receiver: relation.receiver,
      targetMethodTypeArguments: methodArguments,
      targetInvocationTypeArguments: invocationArguments,
      arguments: arguments_,
      argumentMappings: argumentValidation.argumentMappings,
    },
    argumentMappings: argumentValidation.argumentMappings,
  };
}

export function compareInstantiatedProviderCalls(
  host: Pick<
    CsharpProviderCallInstantiationHost,
    "projectTypes" | "providers" | "target"
  >,
  left: Extract<CsharpProviderCallInstantiation, { readonly kind: "resolved" }>,
  right: Extract<CsharpProviderCallInstantiation, { readonly kind: "resolved" }>,
): "left" | "right" | "equivalent" | "incomparable" {
  const rightByArgument = new Map(
    right.argumentMappings.map((mapping) => [
      mapping.effectiveArgumentIndex,
      mapping,
    ]),
  );
  let leftBetter = false;
  let rightBetter = false;
  for (const leftMapping of left.argumentMappings) {
    const rightConversion = rightByArgument.get(
      leftMapping.effectiveArgumentIndex,
    );
    if (rightConversion === undefined) {
      return "incomparable";
    }
    const preference = compareCsharpImplicitConversionTargets(
      host,
      leftMapping.targetType,
      rightConversion.targetType,
    );
    leftBetter ||= preference === "left";
    rightBetter ||= preference === "right";
    if (preference === "incomparable" || leftBetter && rightBetter) {
      return "incomparable";
    }
  }
  if (rightByArgument.size !== left.argumentMappings.length) {
    return "incomparable";
  }
  if (leftBetter === rightBetter) {
    return "equivalent";
  }
  return leftBetter ? "left" : "right";
}

function validateProviderCallRelation(
  sourceFacts: ReadonlySourceFactResolver | undefined,
  relation: CsharpProviderSignatureRelation,
  source: ResolvedSourceCallInfo,
): string | undefined {
  const sourceParameters = source.sourceSelectedSignatureParameters;
  if (
    relation.parameters.length !== sourceParameters.length ||
    relation.parameters.length !== relation.targetMember.parameters.length -
      (relation.receiver.kind === "target-parameter" ? 1 : 0)
  ) {
    return "Provider parameter relation cardinality does not match the selected source and target signatures.";
  }
  const seenSource = new Set<number>();
  const seenTarget = new Set<number>();
  for (const parameterRelation of relation.parameters) {
    const sourceParameter =
      sourceParameters[parameterRelation.sourceParameterIndex];
    const targetParameter =
      relation.targetMember.parameters[parameterRelation.targetParameterIndex];
    if (
      sourceParameter === undefined ||
      targetParameter === undefined ||
      seenSource.has(parameterRelation.sourceParameterIndex) ||
      seenTarget.has(parameterRelation.targetParameterIndex)
    ) {
      return "Provider parameter relation contains a missing, duplicate, or out-of-range slot.";
    }
    seenSource.add(parameterRelation.sourceParameterIndex);
    seenTarget.add(parameterRelation.targetParameterIndex);
    const sourcePassingMode = csharpSourceArgumentPassingMode(
      sourceFacts,
      sourceParameter.parameterDeclaration ?? sourceParameter.parameterSymbol,
    );
    if (
      sourcePassingMode !== parameterRelation.sourcePassingMode ||
      targetParameter.passingMode !== parameterRelation.targetPassingMode ||
      sourceParameter.acceptsOmission !==
        parameterRelation.sourceAcceptsOmission ||
      (targetParameter.optional === true ||
        targetParameter.csharpOmittableOptionalArgument === true ||
        targetParameter.paramsArray === true) !==
        parameterRelation.targetAcceptsOmission ||
      sourceParameter.rest !== parameterRelation.sourceRest ||
      (targetParameter.paramsArray === true) !==
        parameterRelation.targetParamsArray
    ) {
      return "Provider parameter relation contradicts selected source or target parameter semantics.";
    }
  }
  if (relation.receiver.kind === "target-parameter") {
    const receiverParameter =
      relation.targetMember.parameters[relation.receiver.targetParameterIndex];
    if (
      source.sourceReceiver === undefined ||
      receiverParameter === undefined ||
      seenTarget.has(relation.receiver.targetParameterIndex)
    ) {
      return "Provider first-argument receiver relation is incomplete or overlaps a source parameter.";
    }
  } else if (
    relation.receiver.kind === "instance" &&
    source.sourceReceiver === undefined
  ) {
    return "Provider instance relation has no checker-selected source receiver.";
  }
  return undefined;
}
