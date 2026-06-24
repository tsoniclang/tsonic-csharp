import {
  acceptObservation,
  deferObservation,
  rejectObservation,
} from "@tsonic/tsts";
import type {
  CheckedCallMappingRequest,
  CheckedCallMappingResult,
  CheckedOperationMappingResult,
  CheckedPropertyAccessMappingRequest,
  ExtensionObservation,
  ExtensionObservationContext,
} from "@tsonic/tsts";
import {
  csharpProviderDiagnostic,
} from "../../diagnostics.js";
import {
  csharpTargetId,
} from "../../identity.js";
import {
  getNodejsCheckedCallDeclaration,
  getNodejsCheckedPropertyDeclaration,
} from "./declarations.js";
import type {
  NodejsProviderDeclarationIdentity,
} from "./identity.js";
import {
  getCsharpNodejsStaticPropertyOperation,
  getNodejsCallTargetMember,
} from "./members.js";
import {
  recordCsharpTargetOperation,
} from "../../operations.js";
import {
  createCsharpNodejsSurfaceBindingProvider,
} from "./provider.js";

export {
  createCsharpNodejsSurfaceBindingProvider,
};
export {
  getCsharpNodejsStaticPropertyOperation,
} from "./members.js";

export interface CsharpNodejsSurfaceMappers {
  readonly mapCheckedCall: (
    request: CheckedCallMappingRequest,
    context: ExtensionObservationContext<"operation.mapCheckedCall">,
  ) => ExtensionObservation<CheckedCallMappingResult>;
  readonly mapCheckedPropertyAccess: (
    request: CheckedPropertyAccessMappingRequest,
    context: ExtensionObservationContext<"operation.mapCheckedPropertyAccess">,
  ) => ExtensionObservation<CheckedOperationMappingResult>;
}

export function createCsharpNodejsSurfaceMappers(extensionId: string): CsharpNodejsSurfaceMappers {
  return {
    mapCheckedCall(request, context) {
      if (request.target !== undefined && request.target !== csharpTargetId) {
        return deferObservation;
      }
      const declaration = getNodejsCheckedCallDeclaration(request, context);
      if (declaration === undefined) {
        return deferObservation;
      }
      const member = getNodejsCallTargetMember(declaration);
      if (member === undefined) {
        return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_NODEJS_CALL_NOT_MAPPED", 9100200, `C# NodeJS surface could not map checked ${formatNodejsDeclarationIdentity(declaration)} to a target member.`));
      }
      return acceptObservation<CheckedCallMappingResult>({
        selectedSignature: { member },
      }, [{ message: `C# NodeJS surface target call selected from checked provider module '${declaration.moduleSpecifier}'.` }]);
    },
    mapCheckedPropertyAccess(request, context) {
      if (request.target !== undefined && request.target !== csharpTargetId) {
        return deferObservation;
      }
      const declaration = getNodejsCheckedPropertyDeclaration(request, context);
      if (declaration === undefined) {
        return deferObservation;
      }
      const operation = getCsharpNodejsStaticPropertyOperation(declaration);
      if (operation === undefined) {
        return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_NODEJS_PROPERTY_NOT_MAPPED", 9100201, `C# NodeJS surface could not map checked ${formatNodejsDeclarationIdentity(declaration)} to a target property.`));
      }
      recordCsharpTargetOperation(context, request.expression, operation.csharpOperation, [{ message: `C# NodeJS surface static property operation recorded from checked provider module '${declaration.moduleSpecifier}'.` }]);
      return acceptObservation<CheckedOperationMappingResult>({
        operation: operation.operation,
      }, [{ message: `C# NodeJS surface target property selected from checked provider module '${declaration.moduleSpecifier}'.` }]);
    },
  };
}

function formatNodejsDeclarationIdentity(declaration: NodejsProviderDeclarationIdentity): string {
  const exportName = declaration.exportName === undefined ? "<module>" : declaration.exportName;
  const member = declaration.memberName === undefined ? "" : ` member '${declaration.memberName}'`;
  const signature = declaration.signatureId === undefined ? "" : ` signature '${declaration.signatureId}'`;
  return `'${declaration.moduleSpecifier}' export '${exportName}'${member}${signature}`;
}
