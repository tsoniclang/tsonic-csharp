import {
  providerVirtualDeclarationFactKey,
} from "@tsonic/tsts";
import type {
  CheckedCallMappingRequest,
  ExtensionFactSubject,
  ExtensionObservationContext,
  Node,
  ProviderVirtualDeclarationFact,
  Signature,
} from "@tsonic/tsts";
import {
  asNodeSubject,
} from "../ast-utils.js";
import type {
  CsharpCheckedCallRequestContext,
} from "../checked-call-request-context.js";

export function getSelectedCallProviderVirtualDeclaration(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
  requestContext?: CsharpCheckedCallRequestContext,
): ProviderVirtualDeclarationFact | undefined {
  return getProviderVirtualDeclaration(context, [
    request.sourceSelectedSignature,
    getSignatureDeclaration(request.sourceSelectedSignature, context),
    request.sourceSelectedDeclaration,
    request.sourceCalleeSymbol,
    requestContext?.calleeSelectedPropertySymbol,
    requestContext?.calleeSelectedPropertyDeclaration,
    requestContext?.calleeSelectedPropertyContainerSymbol,
    requestContext?.calleeSelectedPropertyDeclarationContainer,
  ], { preferSignatureId: request.sourceSelectedSignature !== undefined }) ??
    getCalleePropertyProviderVirtualDeclaration(request, context);
}

function getSignatureDeclaration(
  signature: CheckedCallMappingRequest["sourceSelectedSignature"],
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): Node | undefined {
  const checker = context.compiler?.checker;
  if (signature === undefined || checker === undefined) {
    return undefined;
  }
  return typeof checker.getSignatureDeclaration === "function"
    ? asNodeSubject(checker.getSignatureDeclaration(signature as Signature))
    : undefined;
}

function getCalleePropertyProviderVirtualDeclaration(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): ProviderVirtualDeclarationFact | undefined {
  const compiler = context.compiler;
  const callee = asNodeSubject(request.callee);
  if (compiler === undefined || callee === undefined || !compiler.ast.is.IsPropertyAccessExpression(callee)) {
    return undefined;
  }
  const propertyName = compiler.ast.name(callee);
  if (propertyName === undefined) {
    return undefined;
  }
  return getProviderVirtualDeclaration(context, [callee, propertyName]);
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
