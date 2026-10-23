import type { SourceStorageEffects } from "@tsonic/target-api/analysis";
import { createSourceGlobalCallStorageEffects } from "@tsonic/target-api/analysis";
import type { TargetSourceProgram } from "@tsonic/target-api/source";
import { selectJsSourceCallStorageEffect, jsSourceCallableParameterEffects, jsSourceNativeConstructorStorage,
  jsSourceNativeStorageOperation } from "@tsonic/js-source-profile";
import { csharpTargetId } from "../../../target-model/identities/target.js";
import { csharpSourceProfileDeclarationIdentity } from "../../../policy/identities/selected-source.js";

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
