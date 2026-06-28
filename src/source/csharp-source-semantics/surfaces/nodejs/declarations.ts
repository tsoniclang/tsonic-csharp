import {
  providerVirtualDeclarationFactKey,
} from "@tsonic/tsts";
import type {
  CheckedCallMappingRequest,
  CheckedPropertyAccessMappingRequest,
  ExtensionFactSubject,
  ExtensionObservationContext,
  Signature,
} from "@tsonic/tsts";
import {
  isCsharpNodejsProviderDeclaration,
} from "./identity.js";
import {
  getCsharpCheckedCallRequestContext,
} from "../../checked-call-request-context.js";
import {
  getCsharpCheckedPropertyAccessRequestContext,
} from "../../checked-member-access-request-context.js";
import type {
  NodejsProviderDeclarationIdentity,
} from "./identity.js";

export function getNodejsCheckedCallDeclaration(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): NodejsProviderDeclarationIdentity | undefined {
  if (request.sourceSelectedSignature === undefined) {
    return undefined;
  }
  return getProviderSignatureDeclaration(context, request.sourceSelectedSignature) ??
    getProviderExportDeclaration(context, request.sourceSelectedSignature) ??
    getProviderExportDeclaration(context, request.sourceSelectedDeclaration);
}

export function getNodejsCallDeclarationWithoutSelectedSignature(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): NodejsProviderDeclarationIdentity | undefined {
  if (request.sourceSelectedSignature !== undefined) {
    return undefined;
  }
  const requestContext = getCsharpCheckedCallRequestContext(request, context);
  for (const subject of [
    request.sourceSelectedDeclaration,
    requestContext.calleeAliasedSymbol,
    requestContext.calleeResolvedSymbol,
    requestContext.calleeSymbol,
    request.sourceCalleeSymbol,
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
  const requestContext = getCsharpCheckedPropertyAccessRequestContext(request, context);
  for (const subject of [
    request.sourceSelectedSymbol,
    requestContext.sourceSelectedDeclaration,
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

function getProviderSignatureDeclaration(
  context: ExtensionObservationContext,
  subject: ExtensionFactSubject | undefined,
): NodejsProviderDeclarationIdentity | undefined {
  if (subject === undefined) {
    return undefined;
  }
  const compiler = (context as { readonly compiler?: ExtensionObservationContext["compiler"] }).compiler;
  const declaration = compiler?.checker.getSignatureDeclaration(subject as Signature);
  return getProviderExportDeclaration(context, declaration);
}
