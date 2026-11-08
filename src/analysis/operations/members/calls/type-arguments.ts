import type { SourceApplication, SourceTypeBinding } from "@tsonic/target-api/source";
import type { Node } from "@tsonic/tsts";
import type { CsharpProviderTargetRelation } from "../../../../target-model/identities/provider-relations.js";
import type { CsharpSelectedTargetMethodTypeArgument } from "../../../../target-model/records/objects/members.js";
import type { CsharpRepresentationOutcome } from "../../../../target-model/types/representation.js";
import type { CsharpProviderCallInstantiationHost } from "../../../../policy/model/provider-calls.js";
import { resolveCsharpTargetBindingArguments } from "./binding-instantiation.js";

type SignatureRelation = Extract<CsharpProviderTargetRelation, { readonly kind: "signature" }>;
type Arguments = CsharpRepresentationOutcome<readonly CsharpSelectedTargetMethodTypeArgument[]>;

export function resolveProviderBindingTypeArguments(
  host: CsharpProviderCallInstantiationHost, relation: SignatureRelation, application: SourceApplication,
): Arguments {
  if (relation.bindingTypeArgumentSource === "class-type-arguments" || relation.bindingTypeArgumentSource === "signature-type-arguments") {
    const domain = relation.bindingTypeArgumentSource === "class-type-arguments" ? "class" : "signature";
    return selectedArguments(host, relation, application, domain, relation.bindingTypeParameters, relation.targetBinding.typeParameters?.length ?? 0);
  }
  if ((relation.targetBinding.typeParameters?.length ?? 0) === 0) return Object.freeze({ kind: "represented", value: Object.freeze([]) });
  const occurrence = relation.bindingTypeArgumentSource === "receiver"
    ? application.receiver.kind === "value" ? application.receiver.occurrence : undefined
    : relation.bindingTypeArgumentSource === "callee" ? application.callee.occurrence : application.identity.invocation;
  if (occurrence === undefined) return refused(application,
    "A provider generic binding requires its exact original receiver/callee or result binding domain.");
  let bindingCarrier: import("../../../../target-model/types/model.js").TargetTypeRef;
  if (relation.bindingTypeArgumentSource === "result") {
    const represented = host.representation.represent(application.result, "type-argument", application.identity.invocation);
    if (represented.kind !== "represented") return represented;
    bindingCarrier = represented.value.carrier;
  } else {
    const produced = host.nativeValue(occurrence);
    if (produced.kind !== "represented") return produced;
    bindingCarrier = produced.value;
  }
  const arguments_ = resolveCsharpTargetBindingArguments(relation.targetBinding, [bindingCarrier]);
  return arguments_ === undefined ? refused(application, "The actual Native receiver/callee carrier does not close the selected provider binding.")
    : Object.freeze({ kind: "represented", value: Object.freeze(arguments_.map(targetType => Object.freeze({ kind: "target-derived" as const, targetType }))) });
}

export function resolveMethodTypeArguments(
  host: CsharpProviderCallInstantiationHost, relation: SignatureRelation, application: SourceApplication,
): Arguments {
  return selectedArguments(host, relation, application, "signature", relation.methodTypeParameters, relation.targetMember.typeParameters?.length ?? 0);
}

export function resolveInvocationTypeArguments(
  host: CsharpProviderCallInstantiationHost, relation: SignatureRelation, application: SourceApplication,
): Arguments {
  const count = relation.targetMember.csharpInvocation?.kind === "static-member" &&
    relation.targetMember.csharpInvocation.receiver.kind === "invocation-type-argument" ? 1 : 0;
  return selectedArguments(host, relation, application, "signature", relation.invocationTypeParameters, count);
}

function selectedArguments(
  host: CsharpProviderCallInstantiationHost, relation: SignatureRelation, application: SourceApplication,
  domain: "class" | "signature", mappings: SignatureRelation["bindingTypeParameters"], targetArity: number,
): Arguments {
  const bindings: readonly SourceTypeBinding[] = domain === "class" ? application.identity.classBindings : application.identity.signatureBindings;
  const count = relation.sourceTypeParameterCounts[domain];
  if (bindings.length !== count || mappings.length !== targetArity ||
    domain === "signature" && (application.identity.signature.typeParameters.length !== count ||
      bindings.some((binding, index) => binding.declaration !== application.identity.signature.typeParameters[index]))) {
    return refused(application, `The provider ${domain} type-argument mapping requires its complete original Source binder vector.`);
  }
  const selected: (CsharpSelectedTargetMethodTypeArgument | undefined)[] = Array.from({ length: targetArity });
  const declarations = new Set<Node>();
  for (const mapping of mappings) {
    const binding = bindings[mapping.sourceTypeParameterIndex];
    if (binding === undefined || declarations.has(binding.declaration) || selected[mapping.targetTypeParameterIndex] !== undefined ||
      !Number.isSafeInteger(mapping.targetTypeParameterIndex) || mapping.targetTypeParameterIndex < 0 || mapping.targetTypeParameterIndex >= targetArity) {
      return refused(application, `The provider ${domain} type-argument mapping contains an absent or duplicate original binder.`);
    }
    declarations.add(binding.declaration);
    const value = host.representation.represent(binding.value, "type-argument", application.identity.invocation);
    if (value.kind !== "represented") return value;
    selected[mapping.targetTypeParameterIndex] = Object.freeze({
      kind: "source", targetType: value.value.carrier, evidence: binding.value, parameter: binding.declaration,
    });
  }
  return selected.every((argument): argument is CsharpSelectedTargetMethodTypeArgument => argument !== undefined)
    ? Object.freeze({ kind: "represented", value: Object.freeze(selected) })
    : refused(application, "Every selected Native type parameter requires one exact original Source application argument.");
}

function refused(application: SourceApplication, message: string): Exclude<Arguments, { readonly kind: "represented" }> {
  return Object.freeze({ kind: "native-refused", source: "tsonic-csharp", code: "CSHARP_PROVIDER_TYPE_ARGUMENTS_NOT_PROVEN",
    site: application.identity.invocation, message });
}
