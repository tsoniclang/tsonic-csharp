import type { SourceApplication, SourceTypeDescriptorSignature } from "@tsonic/target-api/source";
import type { CsharpProviderTargetRelation } from "../../../../target-model/identities/provider-relations.js";
import type { CsharpProviderCallInstantiationHost } from "../../../../policy/model/provider-calls.js";
import type { CsharpRepresentationOutcome } from "../../../../target-model/types/representation.js";
import type { CsharpSelectedTargetCall, CsharpProviderArgumentMapping } from "../../../../target-model/records/objects/members.js";
import { substituteCsharpTargetMember, targetTypeRefEquals } from "../../../../policy/types/index.js";
import { compareCsharpImplicitConversionTargets } from "../../../../policy/conversions/index.js";
import { csharpSourceParameterPassingMode } from "../../../../source/extension/arguments.js";
import { csharpRuntimeLocationTargetType } from "../../../../target-model/types/carriers/runtime-carriers.js";
import { csharpSelectedCallResultType } from "../../../../target-model/types/member-facts.js";
import { csharpSourceApplicationSignature } from "../../../source-evidence/representations.js";
import { selectCsharpProviderPointerResult } from "../../pointers/provider-result.js";
import { validateCsharpProviderConstraints } from "./constraint-satisfaction.js";
import { resolveProviderBindingTypeArguments, resolveMethodTypeArguments, resolveInvocationTypeArguments } from "./type-arguments.js";
import { targetTypeParameterSubstitutions, relateCallArguments } from "../../../../policy/operations/members/instantiation-arguments.js";
import { validateArgumentsTargetSelectedParameters } from "./arguments.js";

type SignatureRelation = Extract<CsharpProviderTargetRelation, { readonly kind: "signature" }>;
export type CsharpInstantiatedProviderCall = Extract<CsharpSelectedTargetCall, { readonly origin: "provider" }>;
export type CsharpProviderCallInstantiation =
  | { readonly kind: "resolved"; readonly call: CsharpInstantiatedProviderCall; readonly argumentMappings: readonly CsharpProviderArgumentMapping[] }
  | Exclude<CsharpRepresentationOutcome<never>, { readonly kind: "represented" }>;

export function instantiateCsharpProviderCall(
  host: CsharpProviderCallInstantiationHost, relation: SignatureRelation, source: SourceApplication,
): CsharpProviderCallInstantiation {
  const signature = csharpSourceApplicationSignature(host.facts, source);
  if (signature.kind !== "represented") return signature;
  const failure = validateProviderCallRelation(host, relation, source, signature.value);
  if (failure.kind !== "represented") return failure;
  const bindingArguments = resolveProviderBindingTypeArguments(host, relation, source);
  if (bindingArguments.kind !== "represented") return bindingArguments;
  const methodArguments = resolveMethodTypeArguments(host, relation, source);
  if (methodArguments.kind !== "represented") return methodArguments;
  const invocationArguments = resolveInvocationTypeArguments(host, relation, source);
  if (invocationArguments.kind !== "represented") return invocationArguments;
  const substitutions = targetTypeParameterSubstitutions(relation,
    bindingArguments.value.map(argument => argument.targetType), methodArguments.value);
  if (substitutions === undefined) return refused(source,
    "The selected Native binding and method parameter identities overlap or are incomplete.");
  const targetMember = substituteCsharpTargetMember(relation.targetMember, substitutions);
  const constraint = validateCsharpProviderConstraints(host, {
    targetBinding: relation.targetBinding, bindingArguments: bindingArguments.value, targetMember,
    methodArguments: methodArguments.value, invocationArguments: invocationArguments.value,
  });
  if (constraint !== undefined) return refused(source, constraint);
  const arguments_ = relateCallArguments(relation, targetMember, source);
  if (arguments_ === undefined) return refused(source,
    "The complete canonical Source argument-place vector does not match the Native provider parameter relation.");
  const validation = validateArgumentsTargetSelectedParameters(host, relation, targetMember, source, arguments_);
  if (validation.kind !== "represented") return validation;
  const pointer = selectCsharpProviderPointerResult(host, source);
  if (pointer.kind !== "represented") return pointer;
  const result = csharpSelectedCallResultType(targetMember, false);
  const physical = result === undefined || targetMember.csharpReturnPassing === undefined ? result : csharpRuntimeLocationTargetType(result);
  if (pointer.value.kind === "present" && (physical === undefined || !targetTypeRefEquals(physical, pointer.value.value))) {
    return refused(source, "The actual Native return ABI conflicts with the authenticated Source pointer/result contract.");
  }
  if (physical === undefined) return refused(source, "The selected Native call metadata has no complete physical return ABI.");
  return Object.freeze({ kind: "resolved", call: Object.freeze({
    origin: "provider", relation, targetMember, receiver: relation.receiver,
    targetMethodTypeArguments: methodArguments.value, targetInvocationTypeArguments: invocationArguments.value,
    arguments: arguments_, argumentMappings: validation.value,
  }), argumentMappings: validation.value });
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
    let preference: "left" | "right" | "equivalent" | "incomparable" | undefined;
    if (leftMapping.kind !== "checked-source" && rightConversion.kind !== "checked-source" &&
      targetTypeRefEquals(leftMapping.sourceType, rightConversion.sourceType)) {
      const exactLeft = targetTypeRefEquals(leftMapping.sourceType, leftMapping.targetType);
      const exactRight = targetTypeRefEquals(rightConversion.sourceType, rightConversion.targetType);
      if (exactLeft !== exactRight) preference = exactLeft ? "left" : "right";
    }
    preference ??= compareCsharpImplicitConversionTargets(host, leftMapping.targetType, rightConversion.targetType);
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
  host: CsharpProviderCallInstantiationHost, relation: SignatureRelation, application: SourceApplication,
  source: SourceTypeDescriptorSignature,
): CsharpRepresentationOutcome<true> {
  if (relation.parameters.length !== source.parameters.length ||
    relation.parameters.length !== relation.targetMember.parameters.length - (relation.receiver.kind === "target-parameter" ? 1 : 0)) {
    return refused(application, "The Native provider parameter relation must cover the complete original Source and physical Native signatures.");
  }
  const sourceIndexes = new Set<number>();
  const targetIndexes = new Set<number>();
  for (const parameter of relation.parameters) {
    const selected = source.parameters[parameter.sourceParameterIndex];
    const target = relation.targetMember.parameters[parameter.targetParameterIndex];
    if (selected === undefined || target === undefined || sourceIndexes.has(parameter.sourceParameterIndex) ||
      targetIndexes.has(parameter.targetParameterIndex)) return refused(application, "The Native provider parameter relation contains an absent or duplicate slot.");
    sourceIndexes.add(parameter.sourceParameterIndex);
    targetIndexes.add(parameter.targetParameterIndex);
    const passing = selected.declaration === undefined ? Object.freeze({ kind: "resolved" as const, value: "by-value" as const })
      : csharpSourceParameterPassingMode(host.facts.protocols, selected.declaration);
    if (passing.kind === "refused") return Object.freeze({ kind: "source-refused", refusal: passing });
    const mode = passing.value;
    if (mode !== parameter.sourcePassingMode || target.passingMode !== parameter.targetPassingMode ||
      (selected.kind !== "required") !== parameter.sourceAcceptsOmission || (selected.kind === "rest") !== parameter.sourceRest ||
      (target.optional === true || target.csharpOmittableOptionalArgument === true || target.paramsArray === true) !== parameter.targetAcceptsOmission ||
      (target.paramsArray === true) !== parameter.targetParamsArray) return refused(application, "The Native provider parameter relation contradicts an original Source slot or exact Native parameter law.");
  }
  if (relation.receiver.kind === "none") return Object.freeze({ kind: "represented", value: true });
  if (application.receiver.kind !== "value") return refused(application, "The selected Native instance/target-parameter call requires its canonical Source value receiver.");
  if (relation.receiver.kind === "target-parameter" &&
    (relation.targetMember.parameters[relation.receiver.targetParameterIndex] === undefined || targetIndexes.has(relation.receiver.targetParameterIndex))) {
    return refused(application, "The Native first-parameter receiver overlaps an authored Source argument or has no physical parameter.");
  }
  return Object.freeze({ kind: "represented", value: true });
}

function refused(source: SourceApplication, message: string): Exclude<CsharpRepresentationOutcome<never>, { readonly kind: "represented" }> {
  return Object.freeze({ kind: "native-refused", source: "tsonic-csharp", code: "CSHARP_PROVIDER_CALL_NOT_PROVEN",
    site: source.identity.invocation, message });
}
