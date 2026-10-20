import type { SourceStorageEffects } from "@tsonic/target-api/analysis";
import { createSourceGlobalCallStorageEffects } from "@tsonic/target-api/analysis";
import type { TargetSourceProgram } from "@tsonic/target-api/source";
import { selectJsSourceCallStorageEffect, jsSourceCallableParameterEffects, jsSourceNativeConstructorStorage } from "@tsonic/js-source-profile";
import { csharpTargetId } from "../../target-model/identities/source.js";
import { csharpSourceProfileDeclarationIdentity } from "../../policy/identities/selected-source.js";

export function createCsharpSourceProfileStorageEffects(source: TargetSourceProgram): SourceStorageEffects {
  const global = createSourceGlobalCallStorageEffects(source, (node, call) => {
    const semantics = source.semantics.forNode(node);
    const declaration = semantics.declarations.signatureDeclaration(call.selectedSignature);
    const identity = csharpSourceProfileDeclarationIdentity(source.ast, semantics, source.sourceFacts, declaration);
    if (identity === undefined || identity.owner !== "js" && identity.owner !== csharpTargetId ||
      identity.declaringName === undefined) return undefined;
    const memberName = identity.kind === "member" ? identity.name
      : identity.kind === "construct" ? "constructor"
      : identity.kind === "call" && identity.name === undefined ? "call" : undefined;
    return memberName === undefined || identity.owner !== "js" && memberName !== "constructor" && memberName !== "call"
      ? undefined : selectJsSourceCallStorageEffect({ ownerName: identity.declaringName, memberName, declaration: identity.declaration }, call);
  }, (declaration, semantics) => {
    const identity = csharpSourceProfileDeclarationIdentity(source.ast, semantics, source.sourceFacts, declaration);
    return identity?.kind !== "construct" || identity.declaringName === undefined ? undefined
      : jsSourceNativeConstructorStorage({ ownerName: identity.declaringName, memberName: "constructor", declaration: identity.declaration });
  });
  return Object.freeze({ ...global,
    callbackEntries(node, call) {
      const semantics = source.semantics.forNode(node);
      const declaration = semantics.declarations.signatureDeclaration(call.selectedSignature);
      const identity = csharpSourceProfileDeclarationIdentity(source.ast, semantics, source.sourceFacts, declaration);
      const nativeConstructor = identity?.owner === csharpTargetId && identity.kind === "construct" &&
        identity.declaringName === "PromiseConstructor" && identity.declaration === declaration &&
        source.ast.is.IsNewExpression(node) && declaration !== undefined && source.ast.is.IsConstructSignatureDeclaration(declaration) &&
        call.sourceSelectedSignatureKind === "resolved";
      if (identity === undefined || identity.owner !== "js" && !nativeConstructor || identity.declaringName === undefined) return undefined;
      const memberName = identity.kind === "construct" ? "constructor" : identity.kind === "member" ? identity.name : undefined;
      return memberName === undefined ? undefined : jsSourceCallableParameterEffects({ ownerName: identity.declaringName, memberName });
    },
  } satisfies SourceStorageEffects);
}
