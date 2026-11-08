import type { Node, ProviderVirtualDeclarationFact } from "@tsonic/tsts";
import type { SourceProgramFacts, SourceResult, TargetSourceProgram } from "@tsonic/target-api/source";
import type { CsharpProviderRelationResolver } from "../../providers/model/relation-resolver.js";
import { resolveCsharpProviderDeclarationEvidence } from "../../source/extension/provider-identities.js";

type NativeConstructorPremise = Parameters<SourceProgramFacts["protocols"]["storageAnalysis"]>[0]["nativeClassConstructors"][number];

export function collectCsharpNativeConstructorPremises(
  source: TargetSourceProgram,
  providers: Pick<CsharpProviderRelationResolver, "resolveSignature" | "resolveType">,
): SourceResult<readonly NativeConstructorPremise[]> {
  const { navigation } = source.facts;
  const premises: NativeConstructorPremise[] = [];
  const visited = new Set<Node>();
  for (const node of navigation.nodes) {
    const binding = navigation.declarationFor(node) ?? node;
    if (visited.has(binding)) continue;
    visited.add(binding);
    if (navigation.isProjectDeclaration(binding)) continue;
    const publication = navigation.providerDeclaration(binding);
    if (publication.kind === "none" || publication.value.memberId !== undefined ||
      publication.value.signatureId !== undefined || publication.value.exportId === undefined ||
      publication.value.exportName === undefined) continue;
    const bindingFact = publication.value;
    const selectedType = providers.resolveType(bindingFact);
    if (selectedType.kind !== "resolved" || selectedType.relations.length !== 1) continue;
    const relation = selectedType.relations[0]!;
    if (relation.kind !== "type" || relation.targetBinding.kind !== "class" ||
      navigation.declarationUseSummary(binding).bindingWritten) continue;
    const original = navigation.classConstructors(binding);
    if (original.kind === "refused") return original;
    if (original.value.kind !== "resolved" || original.value.signatures.length === 0) continue;
    const constructors: NativeConstructorPremise["constructors"][number][] = [];
    for (const signature of original.value.signatures) {
      const declaration = signature.identity.declaration;
      if (declaration === undefined) break;
      const selected = resolveCsharpProviderDeclarationEvidence(navigation, [declaration], "signature");
      if (selected.kind !== "resolved" || !sameProviderExport(bindingFact, selected.declaration)) break;
      const native = providers.resolveSignature(selected.declaration);
      if (native.kind !== "resolved" || native.relations.length !== 1) break;
      const candidate = native.relations[0]!;
      if (candidate.kind !== "signature" || candidate.targetBinding.kind !== "class" ||
        candidate.targetBinding.id !== relation.targetBinding.id || candidate.receiver.kind !== "none" ||
        candidate.targetMember.kind !== "constructor" || candidate.targetMember.csharpConstructorAccessibility === undefined ||
        candidate.targetMember.csharpInvocation !== undefined || candidate.methodTypeParameters.length !== 0 ||
        (candidate.targetMember.typeParameters?.length ?? 0) !== 0) break;
      constructors.push(signature.identity);
    }
    if (constructors.length === original.value.signatures.length) premises.push(Object.freeze({ binding,
      constructors: Object.freeze(constructors) }));
  }
  return Object.freeze({ kind: "resolved", value: Object.freeze(premises) });
}

function sameProviderExport(left: ProviderVirtualDeclarationFact, right: ProviderVirtualDeclarationFact): boolean {
  return left.providerId === right.providerId && left.providerVersion === right.providerVersion &&
    left.providerModuleId === right.providerModuleId && left.moduleSpecifier === right.moduleSpecifier &&
    left.artifactFileName === right.artifactFileName && left.exportId === right.exportId && left.exportName === right.exportName;
}
