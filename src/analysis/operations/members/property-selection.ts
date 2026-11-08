import type { ExtensionDiagnostic, Node, SourceFile } from "@tsonic/tsts";
import type { SourceMemberUse } from "@tsonic/target-api/source";
import type { CsharpProviderTargetRelation, CsharpTargetReceiverRelation } from "../../../target-model/identities/provider-relations.js";
import type { CsharpTargetMember } from "../../../target-model/types/model.js";
import type { CsharpRepresentationOutcome } from "../../../target-model/types/representation.js";
import type { CsharpProviderCallSelectionHost } from "../../../policy/model/provider-calls.js";
import { instantiateCsharpProviderBindingMember } from "./calls/binding-instantiation.js";
import { resolveCsharpProviderMemberRelations } from "./relations.js";
import { providerReceiverMatchesProperty, csharpProviderPropertySupportsAccess } from "../../../policy/operations/members/property-selection.js";

type Relation = Extract<CsharpProviderTargetRelation, { readonly kind: "member" | "value" }>;

export interface CsharpSelectedProviderProperty {
  readonly source: SourceMemberUse;
  readonly relation: Relation;
  readonly targetMember: CsharpTargetMember;
  readonly receiver: CsharpTargetReceiverRelation;
}

export type CsharpProviderPropertySelection =
  | { readonly kind: "resolved"; readonly property: CsharpSelectedProviderProperty }
  | { readonly kind: "not-provider"; readonly source: SourceMemberUse; readonly reason: string }
  | { readonly kind: "missing" | "conflict"; readonly reason: string }
  | { readonly kind: "ambiguous"; readonly reason: string; readonly candidates: readonly string[] }
  | { readonly kind: "rejected"; readonly diagnostic: ExtensionDiagnostic }
  | Exclude<CsharpRepresentationOutcome<never>, { readonly kind: "represented" }>;

export function selectCsharpProviderProperty(
  host: CsharpProviderCallSelectionHost, occurrence: Node, _sourceFile: SourceFile,
): CsharpProviderPropertySelection {
  const published = host.facts.objects.use(occurrence);
  if (published.kind === "refused") return Object.freeze({ kind: "source-refused", refusal: published });
  const source = published.value;
  const resolution = resolveCsharpProviderMemberRelations(host, source);
  if (resolution.kind === "missing") return { kind: "not-provider", source, reason: resolution.reason };
  if (resolution.kind !== "resolved") return resolution;
  const candidates: CsharpSelectedProviderProperty[] = [];
  for (const relation of resolution.relations) {
    if (relation.kind !== "member" && relation.kind !== "value") continue;
    let targetMember: CsharpTargetMember | undefined;
    if (relation.kind === "value") targetMember = relation.targetMember;
    else {
      const evidence = relation.bindingTypeArgumentSource === "result" ? source.readType ?? source.writeType : source.receiver.value;
      if (evidence === undefined) continue;
      const owner = host.representation.represent(evidence, "type-argument", occurrence);
      if (owner.kind !== "represented") return owner;
      targetMember = instantiateCsharpProviderBindingMember(relation.targetBinding, relation.targetMember,
        relation.bindingTypeParameters, [owner.value.carrier]);
    }
    const receiver = relation.kind === "value" ? Object.freeze({ kind: "none" as const }) : relation.receiver;
    if (targetMember !== undefined && providerReceiverMatchesProperty(receiver, targetMember, source) &&
      csharpProviderPropertySupportsAccess(targetMember, source.access)) candidates.push(Object.freeze({ source, relation, targetMember, receiver }));
  }
  if (candidates.length === 1) return Object.freeze({ kind: "resolved", property: candidates[0]! });
  return candidates.length === 0 ? { kind: "missing", reason: "No exact Native provider field/property satisfies every published member-use access requirement." }
    : { kind: "ambiguous", reason: "Several Native provider fields/properties satisfy the same original Source member use.",
      candidates: candidates.map(candidate => `${candidate.relation.targetBinding.id}::${candidate.targetMember.id}`) };
}
