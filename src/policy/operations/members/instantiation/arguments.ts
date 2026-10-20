import type { CsharpProviderTargetRelation, CsharpTargetReceiverRelation } from "../../../../target-model/identities/provider-relations.js";
import type { CsharpTargetMember, TargetTypeRef } from "../../../types/index.js";

import { csharpTargetBindingSubstitutions } from "../../../types/index.js";

import { mergeCsharpTypeParameterSubstitutions } from "./binding-instantiation.js";

import type { CsharpSelectedCallArgument, CsharpSelectedTargetMethodTypeArgument } from "../../../../target-model/records/members.js";
import type { ResolvedSourceCallInfo } from "../../../../target-model/records/source-calls.js";

type CsharpProviderSignatureRelation = Extract<
  CsharpProviderTargetRelation,
  { readonly kind: "signature" }
>;

export function targetTypeParameterSubstitutions(
  relation: CsharpProviderSignatureRelation,
  bindingArguments: readonly TargetTypeRef[],
  methodArguments: readonly CsharpSelectedTargetMethodTypeArgument[],
): ReadonlyMap<string, TargetTypeRef> | undefined {
  const bindingSubstitutions = csharpTargetBindingSubstitutions(
    relation.targetBinding,
    bindingArguments,
  );
  if (bindingSubstitutions === undefined) {
    return undefined;
  }
  const methodSubstitutions = new Map<string, TargetTypeRef>();
  for (const [index, parameter] of
    (relation.targetMember.typeParameters ?? []).entries()) {
    const argument = methodArguments[index];
    if (argument === undefined || methodSubstitutions.has(parameter.identity)) {
      return undefined;
    }
    methodSubstitutions.set(parameter.identity, argument.targetType);
  }
  return mergeCsharpTypeParameterSubstitutions(
    bindingSubstitutions,
    methodSubstitutions,
  );
}

export function relateCallArguments(
  relation: CsharpProviderSignatureRelation,
  targetMember: CsharpTargetMember,
  source: ResolvedSourceCallInfo,
): readonly CsharpSelectedCallArgument[] | undefined {
  const parameterBySource = new Map(
    relation.parameters.map((parameter) => [
      parameter.sourceParameterIndex,
      parameter,
    ]),
  );
  const related: CsharpSelectedCallArgument[] = [];
  for (const binding of source.sourceArgumentBindings) {
    const parameterRelation = parameterBySource.get(
      binding.sourceParameterIndex,
    );
    const targetParameter = parameterRelation === undefined
      ? undefined
      : targetMember.parameters[parameterRelation.targetParameterIndex];
    if (parameterRelation === undefined || targetParameter === undefined) {
      return undefined;
    }
    related.push({
      sourceArgumentIndex: binding.sourceArgumentIndex,
      effectiveArgumentIndex: binding.effectiveArgumentIndex,
      sourceForm: binding.sourceForm,
      ...(binding.spreadElementIndex === undefined
        ? {}
        : { spreadElementIndex: binding.spreadElementIndex }),
      targetParameterIndex: parameterRelation.targetParameterIndex,
      targetParameter,
    });
  }
  return Object.freeze(related);
}

export function everyRequiredTargetParameterIsSupplied(
  targetMember: CsharpTargetMember,
  arguments_: readonly CsharpSelectedCallArgument[],
  receiver: CsharpTargetReceiverRelation,
): boolean {
  const supplied = new Set(
    arguments_.map((argument) => argument.targetParameterIndex),
  );
  if (receiver.kind === "target-parameter") {
    supplied.add(receiver.targetParameterIndex);
  }
  return targetMember.parameters.every((parameter, index) =>
    supplied.has(index) ||
    parameter.optional === true ||
    parameter.csharpOmittableOptionalArgument === true ||
    parameter.paramsArray === true);
}
