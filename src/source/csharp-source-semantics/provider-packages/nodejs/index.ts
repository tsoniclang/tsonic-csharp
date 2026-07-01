import {
  TstsProviderContractVersion,
  acceptObservation,
  deferObservation,
  rejectObservation,
} from "@tsonic/tsts";
import type {
  CheckedCallMappingRequest,
  CheckedCallMappingResult,
  CheckedElementAccessMappingRequest,
  CheckedOperationMappingResult,
  CheckedPropertyAccessMappingRequest,
  CompilerExtension,
  ExtensionDiagnostic,
  ExtensionEvidence,
  ExtensionObservation,
  ExtensionObservationContext,
  ProviderIdentity,
  TargetSemanticProvider,
} from "@tsonic/tsts";
import type {
  TargetProviderModuleOwnership,
  TargetProviderPackageContext,
} from "@tsonic/target-api";
import {
  csharpProviderDiagnostic,
} from "../../diagnostics.js";
import {
  csharpJsSurfaceExtensionId,
  csharpNodejsProviderPackageExtensionId,
  csharpProviderVersion,
  csharpTargetId,
} from "../../identity.js";
import {
  getNodejsCallDeclarationWithoutSelectedSignature,
  getNodejsCheckedCallDeclaration,
  getNodejsCheckedElementDeclaration,
  getNodejsCheckedPropertyDeclaration,
} from "./declarations.js";
import type {
  NodejsProviderDeclarationIdentity,
} from "./identity.js";
import type {
  NodejsUnsupportedTargetIdentity,
} from "./members/types.js";
import {
  getCsharpNodejsElementOperationForReceiverType,
  getCsharpNodejsPropertyOperation,
  getNodejsCallTargetMember,
  getNodejsUnsupportedTargetIdentityFromMetadata,
} from "./members.js";
import {
  recordCsharpTargetOperation,
} from "../../operations.js";
import {
  csharpTargetOperationFactKey,
} from "../../../csharp-facts.js";
import {
  createCsharpNodejsProviderPackageBindingProvider,
} from "./provider.js";

export {
  createCsharpNodejsProviderPackageBindingProvider,
};
export {
  getCsharpNodejsPropertyOperation,
} from "./members.js";

export const nodejsProviderPackageModuleOwnership: readonly TargetProviderModuleOwnership[] =
  [{
    specifierPrefix: "node:",
    message: "target 'csharp' provider package 'nodejs' must be selected to import Node.js built-in provider modules",
  }];

export function createCsharpNodejsProviderPackageExtension(context: TargetProviderPackageContext): CompilerExtension {
  return {
    identity: {
      id: csharpNodejsProviderPackageExtensionId,
      version: csharpProviderVersion,
      capabilityNamespace: "tsonic.csharp.provider-package.nodejs",
    },
    dependencies: {
      dependsOn: [csharpJsSurfaceExtensionId],
    },
    initialize(extensionContext): void {
      void context;
      extensionContext.registerTargetBindingProvider(createCsharpNodejsProviderPackageBindingProvider());
    },
  };
}

export function createCsharpNodejsProviderPackageOperationsMappers(_context: TargetProviderPackageContext): readonly CsharpNodejsProviderPackageMappers[] {
  return [createCsharpNodejsProviderPackageMappers(csharpNodejsProviderPackageExtensionId)];
}

export function createCsharpNodejsProviderPackageOperationsProvider(): TargetSemanticProvider {
  const mapper = createCsharpNodejsProviderPackageMappers(csharpNodejsProviderPackageExtensionId);
  return {
    identity: nodejsProviderPackageSemanticProviderIdentity(),
    mapCheckedCall(request, context) {
      return mapper.mapCheckedCall(request, context);
    },
    mapCheckedPropertyAccess(request, context) {
      return mapper.mapCheckedPropertyAccess(request, context);
    },
    mapCheckedElementAccess(request, context) {
      return mapper.mapCheckedElementAccess(request, context);
    },
  };
}

function nodejsProviderPackageSemanticProviderIdentity(): ProviderIdentity {
  return {
    id: `${csharpNodejsProviderPackageExtensionId}.semantic`,
    version: csharpProviderVersion,
    target: csharpTargetId,
    extensionContractVersion: TstsProviderContractVersion,
    providerKind: "semantic",
    displayName: "Tsonic C# NodeJS provider-package semantic mapper",
  };
}

export interface CsharpNodejsProviderPackageMappers {
  readonly mapCheckedCall: (
    request: CheckedCallMappingRequest,
    context: ExtensionObservationContext<"operation.mapCheckedCall">,
  ) => ExtensionObservation<CheckedCallMappingResult>;
  readonly mapCheckedPropertyAccess: (
    request: CheckedPropertyAccessMappingRequest,
    context: ExtensionObservationContext<"operation.mapCheckedPropertyAccess">,
  ) => ExtensionObservation<CheckedOperationMappingResult>;
  readonly mapCheckedElementAccess: (
    request: CheckedElementAccessMappingRequest,
    context: ExtensionObservationContext<"operation.mapCheckedElementAccess">,
  ) => ExtensionObservation<CheckedOperationMappingResult>;
}

export function createCsharpNodejsProviderPackageMappers(extensionId: string): CsharpNodejsProviderPackageMappers {
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
            `C# NodeJS provider package requires a selected provider signature for checked ${formatNodejsDeclarationIdentity(missingSignatureDeclaration)}.`,
            missingNodejsSelectedSignatureEvidence(missingSignatureDeclaration),
          ));
        }
        return deferObservation;
      }
      const member = getNodejsCallTargetMember(declaration);
      if (member === undefined) {
        const unsupported = getNodejsUnsupportedTargetIdentityFromMetadata(declaration);
        if (unsupported !== undefined) {
          return rejectObservation(unsupportedNodejsProviderPackageOperationDiagnostic(extensionId, "call", declaration, unsupported));
        }
        return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_NODEJS_CALL_NOT_MAPPED", 9100200, `C# NodeJS provider package could not map checked ${formatNodejsDeclarationIdentity(declaration)} to a target member.`));
      }
      return acceptObservation<CheckedCallMappingResult>({
        selectedSignature: { member },
      }, [{ message: `C# NodeJS provider package target call selected from checked provider module '${declaration.moduleSpecifier}'.` }]);
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
          return rejectObservation(unsupportedNodejsProviderPackageOperationDiagnostic(extensionId, "property", declaration, unsupported));
        }
        return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_NODEJS_PROPERTY_NOT_MAPPED", 9100201, `C# NodeJS provider package could not map checked ${formatNodejsDeclarationIdentity(declaration)} to a target property.`));
      }
      recordCsharpTargetOperation(context, request.expression, operation.csharpOperation, [{ message: `C# NodeJS provider package property operation recorded from checked provider module '${declaration.moduleSpecifier}'.` }]);
      return acceptObservation<CheckedOperationMappingResult>({
        operation: operation.operation,
      }, [{ message: `C# NodeJS provider package target property selected from checked provider module '${declaration.moduleSpecifier}'.` }]);
    },
    mapCheckedElementAccess(request, context) {
      if (request.target !== undefined && request.target !== csharpTargetId) {
        return deferObservation;
      }
      const declaration = getNodejsCheckedElementDeclaration(request, context);
      const receiverOperation = context.factResolver.resolve(request.receiver, csharpTargetOperationFactKey) ??
        context.facts.get(request.receiver, csharpTargetOperationFactKey);
      const operation = declaration === undefined
        ? getCsharpNodejsElementOperationForReceiverType(receiverOperation?.resultType)
        : getCsharpNodejsPropertyOperation(declaration);
      if (declaration === undefined && operation === undefined) {
        return deferObservation;
      }
      if (operation === undefined) {
        if (declaration === undefined) {
          return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_NODEJS_ELEMENT_ACCESS_NOT_MAPPED", 9100204, "C# NodeJS provider package could not map checked element access from receiver target metadata to a target indexer."));
        }
        const unsupported = getNodejsUnsupportedTargetIdentityFromMetadata(declaration);
        if (unsupported !== undefined) {
          return rejectObservation(unsupportedNodejsProviderPackageOperationDiagnostic(extensionId, "element", declaration, unsupported));
        }
        return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_NODEJS_ELEMENT_ACCESS_NOT_MAPPED", 9100204, `C# NodeJS provider package could not map checked element access ${formatNodejsDeclarationIdentity(declaration)} to a target indexer.`));
      }
      const elementEvidenceSource = declaration === undefined
        ? "checked receiver target operation metadata"
        : `checked provider module '${declaration.moduleSpecifier}'`;
      recordCsharpTargetOperation(context, request.expression, operation.csharpOperation, [{ message: `C# NodeJS provider package element operation recorded from ${elementEvidenceSource}.` }]);
      return acceptObservation<CheckedOperationMappingResult>({
        operation: operation.operation,
      }, [{ message: `C# NodeJS provider package target element access selected from ${elementEvidenceSource}.` }]);
    },
  };
}

function formatNodejsDeclarationIdentity(declaration: NodejsProviderDeclarationIdentity): string {
  const exportName = declaration.exportName === undefined ? "<module>" : declaration.exportName;
  const member = declaration.memberName === undefined ? "" : ` member '${declaration.memberName}'`;
  const signature = declaration.signatureId === undefined ? "" : ` signature '${declaration.signatureId}'`;
  return `'${declaration.moduleSpecifier}' export '${exportName}'${member}${signature}`;
}

function unsupportedNodejsProviderPackageOperationDiagnostic(
  extensionId: string,
  operationKind: "call" | "element" | "property",
  declaration: NodejsProviderDeclarationIdentity,
  unsupported: NodejsUnsupportedTargetIdentity,
): ExtensionDiagnostic {
  return csharpProviderDiagnostic(
    extensionId,
    "CSHARP_NODEJS_PROVIDER_PACKAGE_OPERATION_UNSUPPORTED",
    9100203,
    `C# NodeJS provider package hard-rejected selected ${operationKind} ${formatNodejsDeclarationIdentity(declaration)}: ${unsupported.displayName} has no closed target/runtime operation metadata.`,
    unsupportedNodejsProviderPackageOperationEvidence(declaration, unsupported),
  );
}

function unsupportedNodejsProviderPackageOperationEvidence(
  declaration: NodejsProviderDeclarationIdentity,
  unsupported: NodejsUnsupportedTargetIdentity,
): readonly ExtensionEvidence[] {
  return [
    {
      message: "Selected NodeJS provider-package operation evidence",
      details: {
        providerModuleId: declaration.providerModuleId,
        moduleSpecifier: declaration.moduleSpecifier,
        exportName: declaration.exportName ?? null,
        memberName: declaration.memberName ?? null,
        signatureId: declaration.signatureId ?? null,
        targetIdentityId: unsupported.targetIdentityId,
        reason: "selected NodeJS provider identity is declared unsupported until closed provider-package target/runtime metadata exists",
        requiredFacts: [
          "selected NodeJS provider declaration/signature identity",
          "NodeJS provider-package target operation metadata",
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
        reason: "NodeJS provider-package calls require TSTS-selected provider signature identity before target member selection",
        requiredFacts: [
          "selected NodeJS provider declaration identity",
          "selected NodeJS provider signature identity",
          "provider-package target operation metadata",
        ],
        capabilityIds: [
          "diagnostic.missing-provider-fact",
          "diagnostic.unsupported-selected-surface-operation",
        ],
      },
    },
  ];
}
