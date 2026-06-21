import {
  providerVirtualDeclarationFactKey,
} from "@tsonic/tsts";
import type {
  CheckedCallMappingRequest,
  CheckedPropertyAccessMappingRequest,
  ExtensionFactSubject,
  ExtensionObservationContext,
  ProviderVirtualDeclarationFact,
} from "@tsonic/tsts";
import {
  isNodejsProviderModule,
} from "./members.js";

export interface NodejsProviderDeclarationReference {
  readonly moduleSpecifier: string;
  readonly exportName: string;
}

export function getNodejsCheckedCallDeclaration(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): NodejsProviderDeclarationReference | undefined {
  const direct = getProviderExportDeclaration(context, request.sourceSelectedDeclaration);
  if (direct !== undefined) {
    return direct;
  }
  const moduleDeclaration = getProviderModuleDeclaration(context, [
    request.calleeReceiverAliasedSymbol,
    request.calleeReceiverResolvedSymbol,
    request.calleeReceiverSymbol,
    request.calleeReceiver,
  ]);
  return moduleDeclaration === undefined || request.calleePropertyName === undefined
    ? undefined
    : {
        moduleSpecifier: moduleDeclaration.moduleSpecifier,
        exportName: request.calleePropertyName,
      };
}

export function getNodejsCheckedPropertyDeclaration(
  request: CheckedPropertyAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedPropertyAccess">,
): NodejsProviderDeclarationReference | undefined {
  const direct = getProviderExportDeclaration(context, request.sourceSelectedDeclaration);
  if (direct !== undefined) {
    return direct;
  }
  const moduleDeclaration = getProviderModuleDeclaration(context, [
    request.receiverAliasedSymbol,
    request.receiverResolvedSymbol,
    request.receiverSymbol,
    request.receiver,
  ]);
  return moduleDeclaration === undefined
    ? undefined
    : {
        moduleSpecifier: moduleDeclaration.moduleSpecifier,
        exportName: request.propertyName,
      };
}

function getProviderExportDeclaration(
  context: ExtensionObservationContext,
  subject: ExtensionFactSubject | undefined,
): NodejsProviderDeclarationReference | undefined {
  const declaration = context.facts.get(subject, providerVirtualDeclarationFactKey);
  return declaration?.exportName === undefined || !isNodejsProviderModule(declaration.moduleSpecifier)
    ? undefined
    : {
        moduleSpecifier: declaration.moduleSpecifier,
        exportName: declaration.exportName,
      };
}

function getProviderModuleDeclaration(
  context: ExtensionObservationContext,
  subjects: readonly (ExtensionFactSubject | undefined)[],
): ProviderVirtualDeclarationFact | undefined {
  for (const subject of subjects) {
    const declaration = context.facts.get(subject, providerVirtualDeclarationFactKey);
    if (declaration?.exportName === undefined && isNodejsProviderModule(declaration?.moduleSpecifier)) {
      return declaration;
    }
  }
  return undefined;
}
