import { providerVirtualDeclarationFactKey, type Node } from "@tsonic/tsts";
import { sourceIndexedTypeEvidence, type SourceFileSemantics } from "@tsonic/target-api/source";
import type { CsharpTypeResolutionScope } from "./engine.js";
import type { CsharpTypeResolutionState } from "./model.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { csharpTargetBindingSubstitutions, substituteCsharpTargetMember } from "../callables/member-substitution.js";
import { csharpNullableTargetType } from "../../../target-model/types/nullable.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { nextState } from "./state.js";

export function resolveCsharpProviderIndexedAccess(
  scope: CsharpTypeResolutionScope, node: Node, queries: SourceFileSemantics, state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  const evidence = sourceIndexedTypeEvidence(scope.host.ast, queries, node);
  if (evidence === undefined) return undefined;
  const identities = evidence.members.map(member => member.subjects.map(subject =>
    scope.host.sourceFacts?.getFact(subject, providerVirtualDeclarationFactKey)).filter(value => value !== undefined));
  if (identities.every(values => values.length === 0)) return undefined;
  const rejected: TargetTypeRef = { kind: "opaque", id: "provider-indexed-type-evidence-unavailable" };
  const owner = scope.resolveNodeWithState(evidence.owner, queries.sourceFile, nextState(state));
  if (owner?.kind !== "target-named") return rejected;
  let result: TargetTypeRef | undefined;
  for (const [index, values] of identities.entries()) {
    if (values.length === 0) return rejected;
    for (const identity of values) {
      const member = evidence.members[index]!.selection;
      const selection = member.kind === "index"
        ? scope.host.providers.resolveSignature(identity) : scope.host.providers.resolveMember(identity);
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
