import type { SourceStorageEffects } from "@tsonic/target-api/analysis";
import type { TargetSourceProgram } from "@tsonic/target-api/source";
import { jsSourceCallStorageEffect } from "@tsonic/js-source-profile";
import { csharpTargetId } from "../../../target-model/identities/source.js";
import { csharpSourceProfileDeclarationIdentity } from "./source-profile-identity.js";

export function createCsharpSourceProfileStorageEffects(source: TargetSourceProgram): SourceStorageEffects {
  return Object.freeze({
    call(node, call) {
      if (call.sourceSelectedSignatureKind !== "resolved") return undefined;
      const semantics = source.semantics.forNode(node);
      const declaration = semantics.declarations.signatureDeclaration(call.selectedSignature);
      const identity = csharpSourceProfileDeclarationIdentity(source.ast, semantics, source.sourceFacts, declaration);
      if (identity === undefined || identity.owner !== "js" && identity.owner !== csharpTargetId ||
        identity.declaringName === undefined) return undefined;
      const memberName = identity.kind === "member" ? identity.name
        : identity.kind === "construct" ? "constructor"
        : identity.kind === "call" && identity.name === undefined ? "call" : undefined;
      const effect = memberName === undefined ? undefined
        : jsSourceCallStorageEffect({ ownerName: identity.declaringName, memberName }, call);
      return identity.owner === "js" || effect?.resultAllocation !== undefined ? effect : undefined;
    },
  } satisfies SourceStorageEffects);
}
