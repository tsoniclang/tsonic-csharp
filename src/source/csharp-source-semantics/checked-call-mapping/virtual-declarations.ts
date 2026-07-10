import {
  providerVirtualDeclarationFactKey,
} from "@tsonic/tsts";
import type {
  CheckedCallMappingRequest,
  ExtensionFactSubject,
  ExtensionObservationContext,
  ProviderVirtualDeclarationFact,
} from "@tsonic/tsts";
import type {
  CsharpCheckedCallRequestContext,
} from "../checked-call-request-context.js";

export function getSelectedCallProviderVirtualDeclaration(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  requestContext?: CsharpCheckedCallRequestContext,
): ProviderVirtualDeclarationFact | undefined {
  return getProviderVirtualDeclaration(context, [
    request.sourceSelectedDeclaration,
    request.sourceSelectedSignature,
    request.sourceCalleeDeclaration,
    request.sourceCalleeSymbol,
    requestContext?.calleeSelectedPropertyDeclaration,
    requestContext?.calleeSelectedPropertySymbol,
    requestContext?.calleeSelectedPropertyDeclarationContainer,
  ], { preferSignatureId: request.sourceSelectedSignature !== undefined });
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
