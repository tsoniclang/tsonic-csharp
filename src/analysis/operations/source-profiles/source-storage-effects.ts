import type { Node, ProviderVirtualDeclarationFact } from "@tsonic/tsts";
import type { SourceCallSelection, TargetSourceProgramFacts } from "@tsonic/target-api/source";
import { selectJsSourceCallStorageEffect, jsSourceCallableParameterEffects, jsSourceNativeConstructorStorage,
  jsSourceNativeStorageOperation } from "@tsonic/js-source-profile";
import { csharpTargetId } from "../../../target-model/identities/target.js";
import { csharpSourceProfileDeclarationIdentity } from "../../../policy/identities/selected-source.js";
import { resolveCsharpProviderDeclarationEvidence } from "../../../source/extension/provider-identities.js";
import type { CsharpProviderRelationResolver } from "../../../providers/model/relation-resolver.js";

/**
 * The storage effects the Host storage analysis runs with (facts.analyses.storage({ effects }), B2): the Host global
 * call effects (facts.analyses.globalCallStorageEffects) selected per call by the JS source profile, plus the C#
 * native-constructor bindings and profile callback entries. JS storage meaning comes from the JS source profile; C#
 * adds only which provider constructors bind natively.
 */
export type CsharpSourceProfileStorageEffects = ReturnType<TargetSourceProgramFacts["facts"]["analyses"]["globalCallStorageEffects"]>;

export function createCsharpSourceProfileStorageEffects(
  source: TargetSourceProgramFacts,
  providers: Pick<CsharpProviderRelationResolver, "resolveSignature" | "resolveType">,
): CsharpSourceProfileStorageEffects {
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
  const callEffect = (call: SourceCallSelection) => {
    const identity = csharpSourceProfileDeclarationIdentity(source.syntax, source.facts, source.sourceFacts, call.signature);
    if (identity === undefined || identity.owner !== "js" && identity.owner !== csharpTargetId ||
      identity.declaringName === undefined) return undefined;
    const memberName = identity.kind === "member" ? identity.name
      : identity.kind === "construct" ? "constructor"
      : identity.kind === "call" && identity.name === undefined ? "call" : undefined;
    const operation = memberName === undefined ? undefined : { ownerName: identity.declaringName, memberName, declaration: identity.declaration };
    return operation === undefined || identity.owner !== "js" && memberName !== "constructor" && memberName !== "call" &&
      !jsSourceNativeStorageOperation(operation)
      ? undefined : selectJsSourceCallStorageEffect(operation, call);
  };
  const constructorStorage = (declaration: Node) => {
    const identity = csharpSourceProfileDeclarationIdentity(source.syntax, source.facts, source.sourceFacts, declaration);
    return identity?.kind !== "construct" || identity.declaringName === undefined ? undefined
      : jsSourceNativeConstructorStorage({ ownerName: identity.declaringName, memberName: "constructor", declaration: identity.declaration });
  };
  const global = source.facts.analyses.globalCallStorageEffects((_node, call) => callEffect(call), constructorStorage);
  return Object.freeze({ ...global,
    nativeConstructorsFor(binding: Node) {
      if (!source.syntax.is.IsClassDeclaration(binding)) return global.nativeConstructorsFor?.(binding);
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
    callbackEntries(_node: Node, call: SourceCallSelection) {
      const declaration = call.signature;
      const identity = csharpSourceProfileDeclarationIdentity(source.syntax, source.facts, source.sourceFacts, declaration);
      if (identity === undefined || identity.owner !== "js" && identity.owner !== csharpTargetId ||
        identity.declaringName === undefined || identity.declaration !== declaration) return undefined;
      const memberName = identity.kind === "construct" ? "constructor" : identity.kind === "member" ? identity.name : undefined;
      const operation = memberName === undefined ? undefined : { ownerName: identity.declaringName, memberName };
      return operation === undefined || identity.owner !== "js" && !jsSourceNativeStorageOperation(operation)
        ? undefined : jsSourceCallableParameterEffects(operation);
    },
  } satisfies CsharpSourceProfileStorageEffects);
}
