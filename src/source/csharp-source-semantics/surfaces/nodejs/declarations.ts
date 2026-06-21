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
  return undefined;
}

export function getNodejsCheckedPropertyDeclaration(
  request: CheckedPropertyAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedPropertyAccess">,
): NodejsProviderDeclarationReference | undefined {
  const direct = getProviderExportDeclaration(context, request.sourceSelectedDeclaration);
  if (direct !== undefined) {
    return direct;
  }
  return undefined;
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
