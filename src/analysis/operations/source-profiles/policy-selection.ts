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
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";

import type { TargetTypeRef } from "../../../policy/types/index.js";
import type { CsharpProviderCallSelectionHost } from "../../../policy/model/provider-calls.js";
import { csharpSourceProfileDeclarationIdentity } from "../../../policy/identities/selected-source.js";
import type { CsharpSourceProfileDeclarationIdentity } from "../../../policy/identities/selected-source.js";
import { createCsharpSourceProfileInputs } from "../../program/records/program/source-profile-inputs.js";
import { sourceProfilePropertyIdentityMatches, sourceProfileIdentityMatches, selectExactlyOnePolicy } from "../../../policy/operations/source-profiles/source-profile-policy.js";
import {
  csharpSourceProfileCallSource,
  csharpSourceProfileElementSource,
  csharpSourceProfilePropertySource,
} from "../../../policy/operations/source-profiles/source-profile-sources.js";

export function selectCsharpSourceProfileCallPolicy(
  host: CsharpProviderCallSelectionHost,
  call: Node,
  policies: readonly CsharpSourceProfileCallPolicy[],
): CsharpSourceProfileCallPolicyResult | undefined {
  const source = csharpSourceProfileCallSource(host, call);
  const identity = csharpSourceProfileDeclarationIdentity(host.ast, host.facts, host.sourceFacts, source.selection.signature);
  if (identity === undefined) return undefined;
  const matches = policies.filter((policy) => sourceProfileIdentityMatches(policy.source, identity));
  const selected = selectExactlyOnePolicy(matches, identity);
  if (selected.kind === "missing") return undefined;
  if (selected.kind === "ambiguous") return { kind: "rejected", diagnostic: selected.diagnostic };
  const context = { host, source, identity,
    inputs: createCsharpSourceProfileInputs(host, source.receiver === undefined
      ? source.arguments : [source.receiver, ...source.arguments], call, selected.policy.inputRequirements, source) };
  const candidate = selected.policy.select(context);
  if (candidate?.kind !== "resolved" || selected.policy.finalizeArguments !== true) return candidate;
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
  return selected.policy.select({ host, source, identity,
    inputs: createCsharpSourceProfileInputs(host, [source.receiver], access),
    receiverType: receiverType ?? (receiver.kind === "csharp-refused" ? undefined : receiver),
    readonly: selectedMemberReadonly(host, source.selection) });
}

/** Whether the selected member (or index signature) is readonly, from Host object facts. */
function selectedMemberReadonly(
  host: CsharpProviderCallSelectionHost,
  selection: NonNullable<ReturnType<CsharpProviderCallSelectionHost["facts"]["selections"]["memberAccess"]>>,
): boolean {
  const selected = selection.selected;
  if (selected.kind === "index-signature") {
    const index = host.facts.objects.indexes(selection.receiverType).find(entry => entry.declaration === selected.declaration);
    return index?.readonly ?? failTargetAnalysisInvariant("tsonic-csharp",
      "The Host selected an index signature its object facts do not publish.", selection.use);
  }
  const member = host.facts.objects.member(selection.receiverType, { kind: "string", value: selection.name });
  return member?.readonly ?? failTargetAnalysisInvariant("tsonic-csharp",
    "The Host selected a member its object facts do not publish.", selection.use);
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
    csharpSourceProfileDeclarationIdentity(host.ast, host.facts, host.sourceFacts, declaration));
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
  const selected = source.access.selected;
  const declaration = selected.kind === "member" || selected.kind === "index-signature" || selected.kind === "element"
    ? selected.declaration : undefined;
  const identity = csharpSourceProfileDeclarationIdentity(host.ast, host.facts, host.sourceFacts, declaration);
  if (identity === undefined) return undefined;
  const policy = selectExactlyOnePolicy(policies.filter(candidate => sourceProfileIdentityMatches(candidate.source, identity)), identity);
  if (policy.kind === "missing") return undefined;
  if (policy.kind === "ambiguous") return { kind: "rejected", diagnostic: policy.diagnostic };
  return policy.policy.select({ host, source, identity, readonly: source.access.readonly,
    inputs: createCsharpSourceProfileInputs(host, [source.receiver, source.argument], access) });
}
