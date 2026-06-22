import {
  providerVirtualDeclarationFactKey,
} from "@tsonic/tsts";
import type {
  CheckedCallMappingRequest,
  CheckedPropertyAccessMappingRequest,
  ExtensionFactSubject,
  ExtensionObservationContext,
} from "@tsonic/tsts";
import {
  isCsharpNodejsProviderDeclaration,
} from "./identity.js";
import type {
  NodejsProviderDeclarationIdentity,
} from "./identity.js";

export function getNodejsCheckedCallDeclaration(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): NodejsProviderDeclarationIdentity | undefined {
  for (const subject of [
    request.sourceSelectedSignature,
    request.sourceSelectedDeclaration,
    request.calleeAliasedSymbol,
    request.calleeResolvedSymbol,
    request.calleeSymbol,
  ]) {
    const declaration = getProviderExportDeclaration(context, subject);
    if (declaration !== undefined) {
      return declaration;
    }
  }
  return undefined;
}

export function getNodejsCheckedPropertyDeclaration(
  request: CheckedPropertyAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedPropertyAccess">,
): NodejsProviderDeclarationIdentity | undefined {
  for (const subject of [
    request.sourceSelectedDeclaration,
  ]) {
    const declaration = getProviderExportDeclaration(context, subject);
    if (declaration !== undefined) {
      return declaration;
    }
  }
  return undefined;
}

function getProviderExportDeclaration(
  context: ExtensionObservationContext,
  subject: ExtensionFactSubject | undefined,
): NodejsProviderDeclarationIdentity | undefined {
  const declaration = context.facts.get(subject, providerVirtualDeclarationFactKey);
  return declaration === undefined || !isCsharpNodejsProviderDeclaration(declaration)
    ? undefined
    : declaration;
}
