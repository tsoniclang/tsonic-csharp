import {
  providerVirtualDeclarationFactKey,
} from "@tsonic/tsts";
import type {
  CheckedCallMappingRequest,
  ExtensionFactSubject,
  ExtensionObservationContext,
  ProviderVirtualDeclarationFact,
} from "@tsonic/tsts";
import {
  getApplicableSourceCallEvidence,
} from "../selected-source-evidence.js";
import type {
  CsharpCheckedCallRequestContext,
} from "../checked-call-request-context.js";

export function getSelectedCallProviderVirtualDeclaration(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  requestContext?: CsharpCheckedCallRequestContext,
): ProviderVirtualDeclarationFact | undefined {
  const sourceSelection = getApplicableSourceCallEvidence(request);
  return getProviderVirtualDeclaration(context, [
    sourceSelection?.declaration,
    sourceSelection?.signature,
    request.sourceCallee.selectedDeclaration,
    request.sourceCallee.selectedSymbol,
    request.sourceCallee.declaration,
    request.sourceCallee.symbol,
    requestContext?.calleeSelectedPropertyDeclaration,
    requestContext?.calleeSelectedPropertySymbol,
  ], { preferSignatureId: sourceSelection !== undefined });
}

function getProviderVirtualDeclaration(
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  subjects: readonly (ExtensionFactSubject | undefined)[],
  options: { readonly preferSignatureId?: boolean } = {},
): ProviderVirtualDeclarationFact | undefined {
  let first: ProviderVirtualDeclarationFact | undefined;
  for (const subject of subjects) {
    if (subject === undefined) {
      continue;
    }
    const declaration = context.factResolver.resolve(subject, providerVirtualDeclarationFactKey);
    if (declaration !== undefined) {
      if (first === undefined) {
        first = declaration;
      }
      if (options.preferSignatureId !== true || declaration.signatureId !== undefined) {
        return declaration;
      }
    }
  }
  return first;
}
