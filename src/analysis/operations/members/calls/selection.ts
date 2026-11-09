import type { Node, SourceFile, ExtensionDiagnostic } from "@tsonic/tsts";
import type { SourceApplication } from "@tsonic/target-api/source";
import type { CsharpProviderCallSelectionHost } from "../../../../policy/model/provider-calls.js";
import type { CsharpRepresentationOutcome } from "../../../../target-model/types/representation.js";
import { resolveCsharpProviderCallRelations } from "../relations.js";
import { compareInstantiatedProviderCalls, instantiateCsharpProviderCall, type CsharpInstantiatedProviderCall, type CsharpProviderCallInstantiation } from "./instantiation.js";
import { selectCsharpInheritedConstructorTarget } from "./implicit-super.js";

export type CsharpProviderCallSelection =
  | { readonly kind: "resolved"; readonly source: SourceApplication; readonly call: CsharpInstantiatedProviderCall }
  | { readonly kind: "not-provider"; readonly source: SourceApplication; readonly reason: string }
  | { readonly kind: "missing" | "conflict"; readonly reason: string }
  | { readonly kind: "ambiguous"; readonly reason: string; readonly candidates: readonly string[] }
  | { readonly kind: "rejected"; readonly diagnostic: ExtensionDiagnostic }
  | Exclude<CsharpRepresentationOutcome<never>, { readonly kind: "represented" }>;

export function selectCsharpProviderCall(
  host: CsharpProviderCallSelectionHost, call: Node, _sourceFile: SourceFile,
): CsharpProviderCallSelection {
  const published = host.facts.applications.application(call);
  if (published.kind === "refused") return Object.freeze({ kind: "source-refused", refusal: published });
  const source = published.value;
  const resolution = resolveCsharpProviderCallRelations(host, source);
  if (resolution.kind === "missing") return { kind: "not-provider", source, reason: resolution.reason };
  if (resolution.kind !== "resolved") return resolution;
  const candidates = resolution.relations.filter(relation => relation.kind === "signature")
    .map(relation => instantiateCsharpProviderCall(host, relation, source));
  const sourceRefusal = candidates.find(candidate => candidate.kind === "source-refused");
  if (sourceRefusal !== undefined) return sourceRefusal;
  const providerRefusal = candidates.find(candidate => candidate.kind === "provider-refused");
  if (providerRefusal !== undefined) return providerRefusal;
  const accepted = candidates.filter((candidate): candidate is Extract<CsharpProviderCallInstantiation, { readonly kind: "resolved" }> =>
    candidate.kind === "resolved");
  if (accepted.length === 0) return { kind: "missing", reason: candidates.flatMap(candidate =>
    candidate.kind === "native-refused" ? [candidate.message] : []).join(" ") || "The exact provider signature has no complete Native member relation." };
  const best = accepted.filter(candidate => !accepted.some(other =>
    other !== candidate && compareInstantiatedProviderCalls(host, other, candidate) === "left"));
  if (best.length !== 1) return { kind: "ambiguous", reason: "Several Native target signatures satisfy the same original selected Source signature.",
    candidates: best.map(candidate => `${candidate.call.relation.targetBinding.id}::${candidate.call.targetMember.id}`) };
  const selected = best[0]!.call;
  const member = selected.targetMember;
  if (member.kind === "constructor" && member.csharpInvocation === undefined) {
    if (member.csharpConstructorAccessibility === undefined || member.csharpConstructorObsolete === undefined) return {
      kind: "missing", reason: "An actual Native constructor requires exact accessibility and obsolescence metadata." };
    if (member.csharpConstructorObsolete) return { kind: "missing", reason: "The selected Native constructor is obsolete." };
    if (source.kind === "construct" && !host.facts.navigation.isProjectDeclaration(source.identity.signature.owner) &&
      (member.csharpConstructorAccessibility !== "public" || selected.relation.targetBinding.csharpAbstract === true)) {
      return { kind: "missing", reason: "The selected Native constructor is inaccessible or abstract for direct construction." };
    }
  }
  const forwarding = selectCsharpInheritedConstructorTarget(host, source, member);
  return forwarding.kind === "missing" ? forwarding : Object.freeze({ kind: "resolved", source,
    call: Object.freeze({ ...selected, targetMember: forwarding.member }) });
}
