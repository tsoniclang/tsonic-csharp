import type { SourceStorageEffects } from "@tsonic/target-api/analysis";
import { createSourceGlobalCallStorageEffects } from "@tsonic/target-api/analysis";
import type { TargetSourceProgram } from "@tsonic/target-api/source";
import { selectJsSourceCallStorageEffect } from "@tsonic/js-source-profile";
import { csharpTargetId } from "../../../target-model/identities/source.js";
import { csharpSourceProfileDeclarationIdentity } from "./source-profile-identity.js";

export function createCsharpSourceProfileStorageEffects(source: TargetSourceProgram): SourceStorageEffects {
  return createSourceGlobalCallStorageEffects(source, (node, call) => {
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
  });
}
