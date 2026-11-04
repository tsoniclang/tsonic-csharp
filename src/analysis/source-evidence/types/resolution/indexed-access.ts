import { providerVirtualDeclarationFactKey, type Node, type SourceFile, type ProviderVirtualDeclarationFact } from "@tsonic/tsts";
import { sourceIndexedTypeEvidence, type SourceFileSemantics } from "@tsonic/target-api/source";
import type { CsharpTypeResolutionScope } from "./scope.js";
import type { CsharpTypeResolutionState } from "./model.js";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import { csharpTargetBindingSubstitutions, substituteCsharpTargetMember } from "../../../../policy/types/callables/member-substitution.js";
import { csharpNullableTargetType } from "../../../../target-model/types/carriers/nullable.js";
import { targetTypeRefEquals } from "../../../../target-model/types/equality.js";
import { nextState } from "./state.js";
import type { CsharpProviderRelationResolver } from "../../../../providers/model/relation-resolver.js";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";

type IndexedEvidence = NonNullable<ReturnType<typeof sourceIndexedTypeEvidence>>;

export interface CsharpProviderIndexedMemberSource {
  readonly member: IndexedEvidence["members"][number];
  readonly facts: readonly (ProviderVirtualDeclarationFact | undefined)[];
}

export type CsharpProviderIndexedAccessSource = {
  readonly node: Node;
  readonly queries: SourceFileSemantics;
  readonly state: CsharpTypeResolutionState;
} & (
  | { readonly kind: "not-indexed" }
  | { readonly kind: "indexed"; readonly evidence: IndexedEvidence;
      readonly owner: { readonly node: IndexedEvidence["owner"]; readonly sourceFile: SourceFile; readonly state: CsharpTypeResolutionState };
      readonly members: readonly CsharpProviderIndexedMemberSource[] }
);

export function resolveCsharpProviderIndexedAccess(
  scope: CsharpTypeResolutionScope, node: Node, queries: SourceFileSemantics, state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  return resolveFormedCsharpProviderIndexedAccess(scope, formCsharpProviderIndexedAccessSource(scope, node, queries, state));
}

export function formCsharpProviderIndexedAccessSource(
  scope: Pick<CsharpTypeResolutionScope, "host">,
  node: Node,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): CsharpProviderIndexedAccessSource {
  const evidence = sourceIndexedTypeEvidence(scope.host.ast, queries, node);
  if (evidence === undefined) return Object.freeze({ kind: "not-indexed", node, queries, state });
  return Object.freeze({ kind: "indexed", node, queries, state, evidence,
    owner: Object.freeze({ node: evidence.owner, sourceFile: queries.sourceFile, state: Object.freeze(nextState(state)) }),
    members: Object.freeze(evidence.members.map(member => Object.freeze({ member,
      facts: Object.freeze(member.subjects.map(subject => scope.host.sourceFacts?.getFact(subject, providerVirtualDeclarationFactKey))),
    }))),
  });
}

export function resolveFormedCsharpProviderIndexedAccess(
  scope: Pick<CsharpTypeResolutionScope, "host" | "resolveNodeWithState">,
  source: CsharpProviderIndexedAccessSource,
): TargetTypeRef | undefined {
  assertCsharpProviderIndexedAccessSource(source);
  if (source.kind === "not-indexed") return undefined;
  const owner = scope.resolveNodeWithState(source.owner.node, source.owner.sourceFile, source.owner.state);
  return projectCsharpProviderIndexedMembers(owner, source.members, scope.host.providers);
}

export function assertCsharpProviderIndexedAccessSource(source: CsharpProviderIndexedAccessSource): void {
  if (source === undefined || source.node === undefined || source.queries === undefined || source.state === undefined ||
      source.kind !== "not-indexed" && source.kind !== "indexed") {
    return failTargetAnalysisInvariant("tsonic-csharp", "Provider indexed completion requires its exact retained Source rows.", source?.node);
  }
  if (source.kind === "not-indexed") return;
  if (source.evidence === undefined || source.evidence.members === undefined || source.owner === undefined ||
      source.owner.state === undefined || source.members === undefined ||
      source.owner.node !== source.evidence.owner || source.owner.sourceFile !== source.queries.sourceFile ||
      source.owner.state.depth !== source.state.depth + 1 || source.owner.state.sourceBindings !== source.state.sourceBindings ||
      source.owner.state.sourceStorageBindings !== source.state.sourceStorageBindings ||
      source.owner.state.sourceStorageSubject !== source.state.sourceStorageSubject ||
      source.owner.state.rejectNativeResolution !== source.state.rejectNativeResolution || source.members.length !== source.evidence.members.length) {
    return failTargetAnalysisInvariant("tsonic-csharp", "Provider indexed completion requires its exact retained Source rows.", source.node);
  }
  for (let index = 0; index < source.members.length; index += 1) {
    const member = source.members[index];
    if (member === undefined || member.member === undefined || member.member !== source.evidence.members[index] || member.facts === undefined ||
        member.facts.length !== member.member.subjects.length) {
      return failTargetAnalysisInvariant("tsonic-csharp", "Provider indexed completion requires its exact retained Source rows.", source.node);
    }
    for (let subjectIndex = 0; subjectIndex < member.facts.length; subjectIndex += 1) {
      if (!Object.prototype.hasOwnProperty.call(member.facts, subjectIndex)) return failTargetAnalysisInvariant("tsonic-csharp",
        "Provider indexed completion requires its exact retained Source rows.", source.node);
    }
  }
}

function projectCsharpProviderIndexedMembers(
  owner: TargetTypeRef | undefined,
  members: readonly CsharpProviderIndexedMemberSource[],
  providers: Pick<CsharpProviderRelationResolver, "resolveSignature" | "resolveMember">,
): TargetTypeRef | undefined {
  const identities = members.map(member => member.facts.filter(value => value !== undefined));
  if (identities.every(values => values.length === 0)) return undefined;
  const rejected: TargetTypeRef = { kind: "opaque", id: "provider-indexed-type-evidence-unavailable" };
  if (owner?.kind !== "target-named") return rejected;
  let result: TargetTypeRef | undefined;
  for (const [index, values] of identities.entries()) {
    if (values.length === 0) return rejected;
    for (const identity of values) {
      const member = members[index]!.member.selection;
      const selection = member.kind === "index"
        ? providers.resolveSignature(identity) : providers.resolveMember(identity);
      if (selection.kind !== "resolved" || selection.relations.length !== 1) return rejected;
      const relation = selection.relations[0]!;
      if (relation.kind !== (member.kind === "index" ? "signature" : "member") || relation.targetBinding.id !== owner.id ||
        (member.kind === "index" ? relation.targetMember.kind !== "indexer"
          : !["field", "property"].includes(relation.targetMember.kind))) return rejected;
      const substitutions = csharpTargetBindingSubstitutions(relation.targetBinding, owner.typeArguments ?? []);
      if (substitutions === undefined) return rejected;
      const selected = substituteCsharpTargetMember(relation.targetMember, substitutions).returnType;
      if (selected === undefined) return rejected;
      const carrier = member.kind === "property" && member.property.optional ? csharpNullableTargetType(selected) : selected;
      if (result !== undefined && !targetTypeRefEquals(result, carrier)) return rejected;
      result = carrier;
    }
  }
  return result ?? rejected;
}
