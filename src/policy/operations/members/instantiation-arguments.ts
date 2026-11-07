import type { CsharpProviderTargetRelation, CsharpTargetReceiverRelation } from "../../../target-model/identities/provider-relations.js";
import type { CsharpTargetMember, TargetTypeRef } from "../../types/index.js";

import { csharpTargetBindingSubstitutions } from "../../types/index.js";

import { mergeCsharpTypeParameterSubstitutions } from "./binding-instantiation.js";

import type { CsharpSelectedCallArgument, CsharpSelectedTargetMethodTypeArgument } from "../../../target-model/records/objects/members.js";
import type { SourceCallSelection } from "@tsonic/target-api/source";

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
  source: SourceCallSelection,
): readonly CsharpSelectedCallArgument[] | undefined {
  const parameterBySource = new Map(
    relation.parameters.map((parameter) => [
      parameter.sourceParameterIndex,
      parameter,
    ]),
  );
  const related: CsharpSelectedCallArgument[] = [];
  for (const binding of source.arguments) {
    const parameterRelation = parameterBySource.get(
      binding.parameterIndex,
    );
    const targetParameter = parameterRelation === undefined
      ? undefined
      : targetMember.parameters[parameterRelation.targetParameterIndex];
    if (parameterRelation === undefined || targetParameter === undefined) {
      return undefined;
    }
    related.push({
      sourceArgumentIndex: binding.argumentIndex,
      effectiveArgumentIndex: binding.effectiveIndex,
      sourceForm: binding.form,
      ...(binding.spreadElement === undefined
        ? {}
        : { spreadElementIndex: binding.spreadElement }),
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
