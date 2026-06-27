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
  ExtensionDiagnostic,
  ExtensionEvidence,
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
  getNodejsCallDeclarationWithoutSelectedSignature,
  getNodejsCheckedCallDeclaration,
  getNodejsCheckedPropertyDeclaration,
} from "./declarations.js";
import type {
  NodejsProviderDeclarationIdentity,
} from "./identity.js";
import type {
  NodejsUnsupportedTargetIdentity,
} from "./members/types.js";
import {
  getCsharpNodejsPropertyOperation,
  getNodejsCallTargetMember,
  getNodejsUnsupportedTargetIdentityFromMetadata,
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
  getCsharpNodejsPropertyOperation,
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
        const missingSignatureDeclaration = getNodejsCallDeclarationWithoutSelectedSignature(request, context);
        if (missingSignatureDeclaration !== undefined) {
          return rejectObservation(csharpProviderDiagnostic(
            extensionId,
            "CSHARP_NODEJS_CALL_REQUIRES_SELECTED_SIGNATURE",
            9100202,
            `C# NodeJS surface requires a selected provider signature for checked ${formatNodejsDeclarationIdentity(missingSignatureDeclaration)}.`,
            missingNodejsSelectedSignatureEvidence(missingSignatureDeclaration),
          ));
        }
        return deferObservation;
      }
      const member = getNodejsCallTargetMember(declaration);
      if (member === undefined) {
        const unsupported = getNodejsUnsupportedTargetIdentityFromMetadata(declaration);
        if (unsupported !== undefined) {
          return rejectObservation(unsupportedNodejsSurfaceOperationDiagnostic(extensionId, "call", declaration, unsupported));
        }
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
      const operation = getCsharpNodejsPropertyOperation(declaration);
      if (operation === undefined) {
        const unsupported = getNodejsUnsupportedTargetIdentityFromMetadata(declaration);
        if (unsupported !== undefined) {
          return rejectObservation(unsupportedNodejsSurfaceOperationDiagnostic(extensionId, "property", declaration, unsupported));
        }
        return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_NODEJS_PROPERTY_NOT_MAPPED", 9100201, `C# NodeJS surface could not map checked ${formatNodejsDeclarationIdentity(declaration)} to a target property.`));
      }
      recordCsharpTargetOperation(context, request.expression, operation.csharpOperation, [{ message: `C# NodeJS surface property operation recorded from checked provider module '${declaration.moduleSpecifier}'.` }]);
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

function unsupportedNodejsSurfaceOperationDiagnostic(
  extensionId: string,
  operationKind: "call" | "property",
  declaration: NodejsProviderDeclarationIdentity,
  unsupported: NodejsUnsupportedTargetIdentity,
): ExtensionDiagnostic {
  return csharpProviderDiagnostic(
    extensionId,
    "CSHARP_NODEJS_SURFACE_OPERATION_UNSUPPORTED",
    9100203,
    `C# NodeJS surface hard-rejected selected ${operationKind} ${formatNodejsDeclarationIdentity(declaration)}: ${unsupported.displayName} has no closed target/runtime operation metadata.`,
    unsupportedNodejsSurfaceOperationEvidence(declaration, unsupported),
  );
}

function unsupportedNodejsSurfaceOperationEvidence(
  declaration: NodejsProviderDeclarationIdentity,
  unsupported: NodejsUnsupportedTargetIdentity,
): readonly ExtensionEvidence[] {
  return [
    {
      message: "Selected NodeJS surface operation evidence",
      details: {
        providerModuleId: declaration.providerModuleId,
        moduleSpecifier: declaration.moduleSpecifier,
        exportName: declaration.exportName ?? null,
        memberName: declaration.memberName ?? null,
        signatureId: declaration.signatureId ?? null,
        targetIdentityId: unsupported.targetIdentityId,
        reason: "selected NodeJS provider identity is declared unsupported until closed surface target/runtime metadata exists",
        requiredFacts: [
          "selected NodeJS provider declaration/signature identity",
          "NodeJS surface target operation metadata",
          "closed runtime/provider carrier metadata",
        ],
        capabilityId: "diagnostic.unsupported-selected-surface-operation",
      },
    },
  ];
}

function missingNodejsSelectedSignatureEvidence(
  declaration: NodejsProviderDeclarationIdentity,
): readonly ExtensionEvidence[] {
  return [
    {
      message: "Missing NodeJS selected provider signature evidence",
      details: {
        providerModuleId: declaration.providerModuleId,
        moduleSpecifier: declaration.moduleSpecifier,
        exportName: declaration.exportName ?? null,
        memberName: declaration.memberName ?? null,
        reason: "NodeJS surface calls require TSTS-selected provider signature identity before target member selection",
        requiredFacts: [
          "selected NodeJS provider declaration identity",
          "selected NodeJS provider signature identity",
          "surface target operation metadata",
        ],
        capabilityIds: [
          "diagnostic.missing-provider-fact",
          "diagnostic.unsupported-selected-surface-operation",
        ],
      },
    },
  ];
}
