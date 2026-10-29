import { providerVirtualDeclarationFactKey, type Node, type ExtensionFactSubject, type TypeIndexedAccessMember, type ReadonlySourceFactResolver } from "@tsonic/tsts";
import { sourceIndexedTypeEvidence, type SourceFileSemantics } from "@tsonic/target-api/source";
import type { CsharpTypeResolutionScope } from "./scope.js";
import type { CsharpTypeResolutionState } from "./model.js";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import { csharpTargetBindingSubstitutions, substituteCsharpTargetMember } from "../../../../policy/types/callables/member-substitution.js";
import { csharpNullableTargetType } from "../../../../target-model/types/carriers/nullable.js";
import { targetTypeRefEquals } from "../../../../target-model/types/equality.js";
import { nextState } from "./state.js";
import type { CsharpProviderRelationResolver } from "../../../../providers/model/relation-resolver.js";

type CsharpIndexedCarrierSelection = Pick<Extract<TypeIndexedAccessMember, { readonly kind: "index" }>, "kind" | "index"> |
  Pick<Extract<TypeIndexedAccessMember, { readonly kind: "property" }>, "kind" | "property">;

export function resolveCsharpProviderIndexedAccess(
  scope: CsharpTypeResolutionScope, node: Node, queries: SourceFileSemantics, state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  const evidence = sourceIndexedTypeEvidence(scope.host.ast, queries, node);
  if (evidence === undefined) return undefined;
  const owner = scope.resolveNodeWithState(evidence.owner, queries.sourceFile, nextState(state));
  if (owner?.kind === "tuple") {
    const rejected: TargetTypeRef = { kind: "opaque", id: "native-tuple-index-evidence-unavailable" };
    const source = queries.types.authoredType(evidence.owner);
    if (source === undefined || !queries.types.isTuple(source)) return rejected;
    const elements = queries.types.tupleElementInfos(source);
    if (elements.length !== owner.elements.length || elements.some(element =>
      element.elementKind !== "required" && element.elementKind !== "optional")) return rejected;
    const properties = queries.types.propertyInfos(source);
    let result: TargetTypeRef | undefined;
    for (const { selection } of evidence.members) {
      if (selection.kind !== "property") return rejected;
      const literal = queries.types.numericLiteralValue(selection.indexType) ?? queries.types.stringLiteralValue(selection.indexType);
      const index = typeof literal === "number" ? literal : typeof literal === "string" && /^(0|[1-9][0-9]*)$/u.test(literal)
        ? Number(literal) : undefined;
      if (index === undefined || !Number.isSafeInteger(index) || index < 0 || index >= elements.length ||
        selection.property.name !== String(index)) return rejected;
      const property = properties.find(property => property.symbol === selection.property.symbol);
      const element = owner.elements[index];
      if (element === undefined || property === undefined || property.name !== selection.property.name ||
        property.optional !== selection.property.optional ||
        !queries.types.isIdentical(property.type, selection.readType)) return rejected;
      if (result !== undefined && !targetTypeRefEquals(result, element)) return rejected;
      result = element;
    }
    return result ?? rejected;
  }
  return projectCsharpProviderIndexedMembers(owner, evidence.members, scope.host.providers, scope.host.sourceFacts);
}

function projectCsharpProviderIndexedMembers(
  owner: TargetTypeRef | undefined,
  members: readonly { readonly selection: CsharpIndexedCarrierSelection; readonly subjects: readonly ExtensionFactSubject[] }[],
  providers: Pick<CsharpProviderRelationResolver, "resolveSignature" | "resolveMember">,
  facts: ReadonlySourceFactResolver | undefined,
): TargetTypeRef | undefined {
  const identities = members.map(member => member.subjects.map(subject =>
    facts?.getFact(subject, providerVirtualDeclarationFactKey)).filter(value => value !== undefined));
  if (identities.every(values => values.length === 0)) return undefined;
  const rejected: TargetTypeRef = { kind: "opaque", id: "provider-indexed-type-evidence-unavailable" };
  if (owner?.kind !== "target-named") return rejected;
  let result: TargetTypeRef | undefined;
  for (const [index, values] of identities.entries()) {
    if (values.length === 0) return rejected;
    for (const identity of values) {
      const member = members[index]!.selection;
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
