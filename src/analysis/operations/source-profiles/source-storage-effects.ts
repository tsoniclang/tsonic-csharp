import type { Node, ProviderVirtualDeclarationFact } from "@tsonic/tsts";
import type { SourceStorageEffects } from "@tsonic/target-api/analysis";
import { createSourceGlobalCallStorageEffects } from "@tsonic/target-api/analysis";
import type { TargetSourceProgram } from "@tsonic/target-api/source";
import { selectJsSourceCallStorageEffect, jsSourceCallableParameterEffects, jsSourceNativeConstructorStorage,
  jsSourceNativeStorageOperation } from "@tsonic/js-source-profile";
import { csharpTargetId } from "../../../target-model/identities/target.js";
import { csharpSourceProfileDeclarationIdentity } from "../../../policy/identities/selected-source.js";
import { resolveCsharpProviderDeclarationEvidence } from "../../../source/extension/provider-identities.js";
import type { CsharpProviderRelationResolver } from "../../../providers/model/relation-resolver.js";

export function createCsharpSourceProfileStorageEffects(
  source: TargetSourceProgram,
  providers: Pick<CsharpProviderRelationResolver, "resolveSignature" | "resolveType">,
): SourceStorageEffects {
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
  const global = createSourceGlobalCallStorageEffects(source, (node, call) => {
    const semantics = source.semantics.forNode(node);
    const declaration = semantics.declarations.signatureDeclaration(call.selectedSignature);
    const identity = csharpSourceProfileDeclarationIdentity(source.ast, semantics, source.sourceFacts, declaration);
    if (identity === undefined || identity.owner !== "js" && identity.owner !== csharpTargetId ||
      identity.declaringName === undefined) return undefined;
    const memberName = identity.kind === "member" ? identity.name
      : identity.kind === "construct" ? "constructor"
      : identity.kind === "call" && identity.name === undefined ? "call" : undefined;
    const operation = memberName === undefined ? undefined : { ownerName: identity.declaringName, memberName, declaration: identity.declaration };
    return operation === undefined || identity.owner !== "js" && memberName !== "constructor" && memberName !== "call" &&
      !jsSourceNativeStorageOperation(operation)
      ? undefined : selectJsSourceCallStorageEffect(operation, call);
  }, (declaration, semantics) => {
    const identity = csharpSourceProfileDeclarationIdentity(source.ast, semantics, source.sourceFacts, declaration);
    return identity?.kind !== "construct" || identity.declaringName === undefined ? undefined
      : jsSourceNativeConstructorStorage({ ownerName: identity.declaringName, memberName: "constructor", declaration: identity.declaration });
  });
  return Object.freeze({ ...global,
    nativeConstructorsFor(binding, semantics) {
      if (!source.ast.is.IsClassDeclaration(binding)) return global.nativeConstructorsFor?.(binding, semantics);
      if (!source.semantics.includes(semantics.sourceFile) || source.navigation.isProjectDeclaration(binding) ||
        source.navigation.declarationUseSummary(binding).bindingWritten) return undefined;
      const selectedBinding = resolveCsharpProviderDeclarationEvidence(source.sourceFacts, [binding], "export");
      if (selectedBinding.kind !== "resolved" || selectedBinding.declaration.exportId === undefined ||
        selectedBinding.declaration.exportName === undefined) return undefined;
      const bindingFact = selectedBinding.declaration;
      const type = semantics.declarations.declaredValueType(binding);
      const signatures = type === undefined ? [] : semantics.types.constructSignatures(type);
      if (signatures.length === 0) return undefined;
      const declarations = new Map<Node, ProviderVirtualDeclarationFact>();
      for (const signature of signatures) {
        const declaration = semantics.declarations.signatureDeclaration(signature);
        if (declaration === undefined || !source.ast.is.IsConstructorDeclaration(declaration)) return undefined;
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
    callbackEntries(node, call) {
      const semantics = source.semantics.forNode(node);
      const declaration = semantics.declarations.signatureDeclaration(call.selectedSignature);
      const identity = csharpSourceProfileDeclarationIdentity(source.ast, semantics, source.sourceFacts, declaration);
      if (identity === undefined || identity.owner !== "js" && identity.owner !== csharpTargetId ||
        identity.declaringName === undefined || identity.declaration !== declaration ||
        call.sourceSelectedSignatureKind !== "resolved") return undefined;
      const memberName = identity.kind === "construct" ? "constructor" : identity.kind === "member" ? identity.name : undefined;
      const operation = memberName === undefined ? undefined : { ownerName: identity.declaringName, memberName };
      return operation === undefined || identity.owner !== "js" && !jsSourceNativeStorageOperation(operation)
        ? undefined : jsSourceCallableParameterEffects(operation);
    },
  } satisfies SourceStorageEffects);
}
