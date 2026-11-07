// Source-profile policy selection by the Host-selected declaration of a use (nextgen C-2542, R2).
// The selected declaration is facts.selections.call / memberAccess or facts.values.elementAccess; the profile
// identity is read from that declaration's authored name and file. No checker access (I2).
import { finalizeCsharpRestSequences } from "./rest-sequences.js";
import { sealInvocationOnlyCallableArguments } from "../../../policy/operations/source-profiles/js/invocation-arguments.js";
import { formatSourceIdentity } from "../../../policy/operations/source-profiles/js/common.js";
import { csharpSourceProfileDiagnostic } from "../../../policy/operations/source-profiles/source-profile-policy.js";
import type { CsharpSourceProfileCallPolicyResult, CsharpSourceProfileElementPolicyResult, CsharpSourceProfileCallPolicy, CsharpSourceProfilePropertyPolicy, CsharpSourceProfileElementPolicy } from "../../../policy/model/source-profiles.js";
import type { CsharpSourceProfilePropertyPolicyResult } from "../../../target-model/records/program/source-profile-invocations.js";
import type { Node } from "@tsonic/tsts";
import { csharpElementIndexerIdentities } from "../collections/js-indexers.js";

import type { TargetTypeRef } from "../../../policy/types/index.js";
import type { CsharpProviderCallSelectionHost } from "../../../policy/model/provider-calls.js";
import { csharpSourceProfileDeclarationIdentity } from "../../../policy/identities/selected-source.js";
import type { CsharpSourceProfileDeclarationIdentity } from "../../../policy/identities/selected-source.js";
import { createCsharpSourceProfileInputs } from "../../program/records/program/source-profile-inputs.js";
import type { CsharpSourceProfileInputFacts } from "../../../target-model/records/program/source-profile-inputs.js";
import type { ExtensionDiagnostic } from "@tsonic/tsts";
import { sourceProfilePropertyIdentityMatches, sourceProfileIdentityMatches, selectExactlyOnePolicy } from "../../../policy/operations/source-profiles/source-profile-policy.js";
import {
  csharpSourceProfileCallSource,
  csharpSourceProfileElementSource,
  csharpSourceProfilePropertySource,
} from "./source-profile-sources.js";

export function selectCsharpSourceProfileCallPolicy(
  host: CsharpProviderCallSelectionHost,
  call: Node,
  policies: readonly CsharpSourceProfileCallPolicy[],
): CsharpSourceProfileCallPolicyResult | undefined {
  const source = csharpSourceProfileCallSource(host, call);
  const identity = csharpSourceProfileDeclarationIdentity(host.ast, host.facts, source.selection.signature);
  if (identity === undefined) return undefined;
  const matches = policies.filter((policy) => sourceProfileIdentityMatches(policy.source, identity));
  const selected = selectExactlyOnePolicy(matches, identity);
  if (selected.kind === "missing") return undefined;
  if (selected.kind === "ambiguous") return { kind: "rejected", diagnostic: selected.diagnostic };
  const context = { host, source, identity,
    inputs: createCsharpSourceProfileInputs(host, source.receiver === undefined
      ? source.arguments : [source.receiver, ...source.arguments], call, selected.policy.inputRequirements, source) };
  const candidate = selected.policy.select(context);
  if (candidate?.kind !== "resolved") return inputRefusal(context.inputs) ?? candidate;
  if (selected.policy.finalizeArguments !== true) return candidate;
  const finalized = finalizeCsharpRestSequences(context, candidate.call);
  const finalCall = finalized === undefined ? undefined : sealInvocationOnlyCallableArguments(context, finalized);
  return finalCall === undefined ? { kind: "rejected",
    diagnostic: csharpSourceProfileDiagnostic("CSHARP_JS_SOURCE_PROFILE_CALL_NOT_CLOSED", 9101001,
      `The exact selected JS source-profile call '${formatSourceIdentity(selected.policy.source)}' has no closed C# target relation.`,
      ["The selected declaration is JS source-profile-owned.",
        "The selected source parameter slots must agree with the explicit C# target relation."]) } : { kind: "resolved", call: finalCall };
}

export function selectCsharpSourceProfilePropertyPolicy(
  host: CsharpProviderCallSelectionHost,
  access: Node,
  policies: readonly CsharpSourceProfilePropertyPolicy[],
  receiverType: TargetTypeRef | undefined,
): CsharpSourceProfilePropertyPolicyResult | undefined {
  const identities = sourceProfilePropertyIdentities(host, access);
  const identity = identities[0];
  if (identity === undefined) return undefined;
  const matches = policies.filter((policy) => sourceProfilePropertyIdentityMatches(policy.source, identities));
  const selected = selectExactlyOnePolicy(matches, identity);
  if (selected.kind === "missing") return undefined;
  if (selected.kind === "ambiguous") return { kind: "rejected", diagnostic: selected.diagnostic };
  const source = csharpSourceProfilePropertySource(host, access);
  const receiver = host.types.value(source.receiver.expression);
  const inputs = createCsharpSourceProfileInputs(host, [source.receiver], access);
  const candidate = selected.policy.select({ host, source, identity, inputs,
    receiverType: receiverType ?? (receiver.kind === "csharp-refused" ? undefined : receiver),
    // The Host member-access selection states whether the selected member or index signature is readonly (any receiver:
    // class, interface, array, primitive, union), as the element record does.
    readonly: source.selection.readonly });
  return candidate?.kind === "resolved" ? candidate : inputRefusal(inputs) ?? candidate;
}

/** Profile identities of the declarations the Host selected for a member access (several for merged declarations). */
export function sourceProfilePropertyIdentities(
  host: CsharpProviderCallSelectionHost,
  access: Node,
): readonly CsharpSourceProfileDeclarationIdentity[] {
  const selection = host.facts.selections.memberAccess(access);
  if (selection === undefined) return [];
  const declarations = selection.selected.kind === "member" ? selection.selected.declarations : [selection.selected.declaration];
  const identities = declarations.map((declaration) =>
    csharpSourceProfileDeclarationIdentity(host.ast, host.facts, declaration));
  return identities.length > 0 &&
      identities.every((candidate): candidate is CsharpSourceProfileDeclarationIdentity => candidate !== undefined)
    ? identities
    : [];
}

export function selectCsharpSourceProfileElementPolicy(
  host: CsharpProviderCallSelectionHost,
  access: Node,
  policies: readonly CsharpSourceProfileElementPolicy[],
): CsharpSourceProfileElementPolicyResult | undefined {
  const source = csharpSourceProfileElementSource(host, access);
  // Every indexer declaration the access selects (one per union arm, Host per-arm relation) must match one policy.
  const identities = csharpElementIndexerIdentities(host, source.access);
  const identity = identities?.[0];
  if (identity === undefined) return undefined;
  const policy = selectExactlyOnePolicy(policies.filter(candidate =>
    identities!.every(selected => sourceProfileIdentityMatches(candidate.source, selected))), identity);
  if (policy.kind === "missing") return undefined;
  if (policy.kind === "ambiguous") return { kind: "rejected", diagnostic: policy.diagnostic };
  const inputs = createCsharpSourceProfileInputs(host, [source.receiver, source.argument], access);
  const candidate = policy.policy.select({ host, source, identity, readonly: source.access.readonly, inputs });
  return candidate?.kind === "resolved" ? candidate : inputRefusal(inputs) ?? candidate;
}

/**
 * #79: a policy that selected nothing or rejected, over inputs one of whose carriers the C# representation refused,
 * reports that refusal with its own code and message (a resolved selection is kept unchanged).
 */
function inputRefusal(inputs: CsharpSourceProfileInputFacts):
  { readonly kind: "rejected"; readonly diagnostic: ExtensionDiagnostic } | undefined {
  const refusal = inputs.refusal;
  return refusal === undefined ? undefined
    : Object.freeze({ kind: "rejected", diagnostic: csharpSourceProfileDiagnostic(refusal.code, 9101005, refusal.message) });
}
