import type { Node, ProviderVirtualDeclarationFact } from "@tsonic/tsts";
import type { TargetSourceProgramFacts } from "@tsonic/target-api/source";
import { resolveCsharpProviderDeclarationEvidence } from "../../../source/extension/provider-identities.js";
import type { CsharpProviderRelationResolver } from "../../../providers/model/relation-resolver.js";

/**
 * The C# target premises of the Host storage analysis (facts.analyses.storage({ premises })): which constructors of an
 * ambient provider class the target binds to a plain native constructor. Every JS API call and callback storage effect
 * is a Host fact (facts.profile, D18); C# adds only this target ABI premise.
 */
export type CsharpSourceStorageTargetPremises =
  NonNullable<Parameters<TargetSourceProgramFacts["facts"]["analyses"]["storage"]>[0]["premises"]>;

export function createCsharpSourceStorageTargetPremises(
  source: TargetSourceProgramFacts,
  providers: Pick<CsharpProviderRelationResolver, "resolveSignature" | "resolveType">,
): CsharpSourceStorageTargetPremises {
  const nativeConstructor = (declaration: ProviderVirtualDeclarationFact) => {
    const selection = providers.resolveSignature(declaration);
    if (selection.kind !== "resolved" || selection.relations.length !== 1) return undefined;
    const relation = selection.relations[0]!;
    return relation.kind !== "signature" || relation.targetBinding.kind !== "class" ||
      relation.receiver.kind !== "none" || relation.targetMember.kind !== "constructor" ||
      relation.targetMember.csharpConstructorAccessibility === undefined ||
      relation.targetMember.csharpInvocation !== undefined || relation.methodTypeParameters.length !== 0 ||
      (relation.targetMember.typeParameters?.length ?? 0) !== 0 ? undefined : relation;
  };
  return Object.freeze({
    nativeClassConstructors(binding: Node) {
      if (!source.syntax.is.IsClassDeclaration(binding)) return undefined;
      if (source.facts.navigation.identity.isProjectDeclaration(binding) ||
        source.facts.navigation.uses.summary(binding).bindingWritten) return undefined;
      const selectedBinding = resolveCsharpProviderDeclarationEvidence(source.sourceFacts, [binding], "export");
      if (selectedBinding.kind !== "resolved" || selectedBinding.declaration.exportId === undefined ||
        selectedBinding.declaration.exportName === undefined) return undefined;
      const bindingFact = selectedBinding.declaration;
      const constructors = source.syntax.members(binding).filter((declaration): declaration is Node =>
        declaration !== undefined && source.syntax.is.IsConstructorDeclaration(declaration));
      if (constructors.length === 0) return undefined;
      const declarations = new Map<Node, ProviderVirtualDeclarationFact>();
      for (const declaration of constructors) {
        const selected = resolveCsharpProviderDeclarationEvidence(source.sourceFacts, [declaration], "signature");
        if (selected.kind !== "resolved") return undefined;
        const fact = selected.declaration;
        if (fact.providerId !== bindingFact.providerId || fact.providerVersion !== bindingFact.providerVersion ||
          fact.providerModuleId !== bindingFact.providerModuleId || fact.moduleSpecifier !== bindingFact.moduleSpecifier ||
          fact.artifactFileName !== bindingFact.artifactFileName || fact.exportName !== bindingFact.exportName ||
          fact.exportId !== bindingFact.exportId) return undefined;
        declarations.set(declaration, fact);
      }
      const selectedType = providers.resolveType(bindingFact);
      if (selectedType.kind !== "resolved" || selectedType.relations.length !== 1 ||
        selectedType.relations[0]?.kind !== "type" || selectedType.relations[0].targetBinding.kind !== "class") return undefined;
      const nativeBaseId = selectedType.relations[0].targetBinding.id;
      for (const fact of declarations.values()) {
        const selected = nativeConstructor(fact);
        if (selected === undefined || selected.targetBinding.id !== nativeBaseId) return undefined;
      }
      return Object.freeze([...declarations.keys()]);
    },
  } satisfies CsharpSourceStorageTargetPremises);
}
