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
  asNodeSubject,
} from "../ast-utils.js";

export function getSelectedCallProviderVirtualDeclaration(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): ProviderVirtualDeclarationFact | undefined {
  return getProviderVirtualDeclaration(context, [
    request.sourceSelectedSignature,
    request.sourceSelectedDeclaration,
    request.calleeSymbol,
    request.calleeResolvedSymbol,
    request.calleeAliasedSymbol,
  ]) ?? getCalleePropertyProviderVirtualDeclaration(request, context);
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
): ProviderVirtualDeclarationFact | undefined {
  for (const subject of subjects) {
    if (subject === undefined) {
      continue;
    }
    const declaration = context.factResolver.resolve(subject, providerVirtualDeclarationFactKey);
    if (declaration !== undefined) {
      return declaration;
    }
  }
  return undefined;
}
