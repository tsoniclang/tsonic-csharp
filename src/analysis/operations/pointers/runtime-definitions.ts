import type { Node } from "@tsonic/tsts";
import type { CsharpPolicyContext } from "../../../policy/model/context.js";
import type { CsharpNativeGenericTypeDefinition, TargetTypeRef } from "../../../target-model/types/native-type-data.js";
import type { CsharpNativeCallableApplication } from "../../../target-model/conversions/selection.js";
import type { CsharpRepresentationOutcome } from "../../../target-model/types/representation.js";
import { sourceNativeGenericDefinition } from "../../../policy/types/source-type-flow/representation-runtime.js";
import { applyCsharpNativeDeclaration } from "../../../target-model/types/native-declaration-operations.js";
import { applyCsharpNativeCallableMember, csharpNativeTypeArgumentSatisfiesConstraints } from "../../../policy/conversions/generic-callable.js";
import { substituteTargetTypeParameters } from "../../../target-model/types/substitution.js";
import { nativeRepresentationFailure, represented } from "../../../policy/types/source-type-flow/representation-results.js";

export function selectCsharpMemoryRuntimeMember(input: CsharpPolicyContext, owner: TargetTypeRef,
  name: string, arguments_: readonly TargetTypeRef[], site: Node): CsharpRepresentationOutcome<CsharpNativeCallableApplication> {
  if (owner.kind !== "target-named") throw new TypeError("A Native memory helper requires its actual acquired named owner.");
  const selected = input.providers.acquireNativeDeclaration(owner.id);
  if (selected.kind === "rejected") return Object.freeze({ kind: "provider-refused", diagnostic: selected.diagnostic });
  if (selected.kind === "missing") return nativeRepresentationFailure(site, "CSHARP_NATIVE_HELPER_BINDING_NOT_PROVEN",
    "A Native memory operation requires its complete original helper declaration.");
  const application = applyCsharpNativeDeclaration(selected.definition, owner);
  if (application === undefined) return nativeRepresentationFailure(site, "CSHARP_NATIVE_HELPER_BINDING_NOT_PROVEN",
    "The Native memory helper must retain its exact complete class application.");
  const substitutions = new Map(selected.definition.parameters.map((parameter, index) => [parameter.identity, owner.typeArguments![index]!]));
  for (const [index, parameter] of selected.definition.parameters.entries()) {
    const constraints = parameter.csharpConstraints.constraints.map(constraint => constraint.kind === "type"
      ? { ...constraint, type: substituteTargetTypeParameters(constraint.type, substitutions) } : constraint);
    if (!csharpNativeTypeArgumentSatisfiesConstraints(input, owner.typeArguments![index]!, constraints)) {
      return nativeRepresentationFailure(site, "CSHARP_NATIVE_CONSTRAINT_UNSATISFIED", "The actual memory helper class argument violates its complete Native constraints.");
    }
  }
  const members = application.members.filter(member => member.kind === "callable" && member.member.static === true &&
    member.member.targetName === name && member.method.typeParameters.length === arguments_.length);
  const member = members[0];
  if (members.length !== 1 || member?.kind !== "callable") return nativeRepresentationFailure(site,
    "CSHARP_NATIVE_HELPER_BINDING_NOT_PROVEN", "The original memory helper must supply exactly one complete requested physical method.");
  const original = member.method;
  const applied = applyCsharpNativeCallableMember(input, original, arguments_);
  return applied === undefined ? nativeRepresentationFailure(site, "CSHARP_NATIVE_CONSTRAINT_UNSATISFIED",
    "The actual memory helper method arguments violate their complete Native constraints.")
    : represented(Object.freeze({ original, applied, typeArguments: Object.freeze([...arguments_]) }));
}

export function selectCsharpMemoryRuntimeDefinition(
  input: Pick<CsharpPolicyContext, "providers">,
  name: "Location" | "RawPointer" | "NativeLayout" | "NativeArray" | "RecordField",
  site: Node,
): CsharpRepresentationOutcome<CsharpNativeGenericTypeDefinition> {
  const arity = name === "RawPointer" ? 0 : 1;
  return sourceNativeGenericDefinition({ providers: input.providers,
    acquireNativeDeclaration: identity => input.providers.acquireNativeDeclaration(identity) },
  `Tsonic.CSharp.Runtime.${name}${arity === 0 ? "" : "`1"}`, arity, name === "RecordField" ? "struct" : "class", site);
}
