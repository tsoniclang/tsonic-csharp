import {
  acceptObservation,
  deferObservation,
  providerVirtualDeclarationFactKey,
  rejectObservation,
} from "@tsonic/tsts";
import type {
  CheckedCallMappingRequest,
  CheckedCallMappingResult,
  ExtensionObservation,
  ExtensionObservationContext,
  TargetMember,
} from "@tsonic/tsts";
import {
  csharpProviderDiagnostic,
} from "../../diagnostics.js";
import {
  csharpTargetId,
} from "../../identity.js";
import {
  getNodePathTargetMembers,
  nodePathModuleSpecifier,
} from "./path.js";
import {
  createCsharpNodejsSurfaceBindingProvider,
} from "./provider.js";

export {
  createCsharpNodejsSurfaceBindingProvider,
};

export interface CsharpNodejsSurfaceMappers {
  readonly mapCheckedCall: (
    request: CheckedCallMappingRequest,
    context: ExtensionObservationContext<"operation.mapCheckedCall">,
  ) => ExtensionObservation<CheckedCallMappingResult>;
}

export function createCsharpNodejsSurfaceMappers(extensionId: string): CsharpNodejsSurfaceMappers {
  return {
    mapCheckedCall(request, context) {
      if (request.target !== undefined && request.target !== csharpTargetId) {
        return deferObservation;
      }
      const declaration = context.facts.get(request.sourceSelectedDeclaration, providerVirtualDeclarationFactKey);
      if (declaration?.moduleSpecifier !== nodePathModuleSpecifier || declaration.exportName === undefined) {
        return deferObservation;
      }
      const candidates = getNodePathTargetMembers(declaration.exportName);
      const member = selectSingleTargetMember(candidates);
      if (member === undefined) {
        return rejectObservation(csharpProviderDiagnostic(extensionId, "CSHARP_NODEJS_CALL_NOT_MAPPED", 9100200, `C# NodeJS surface could not map checked '${declaration.moduleSpecifier}' export '${declaration.exportName}' to a target member.`));
      }
      return acceptObservation<CheckedCallMappingResult>({
        selectedSignature: { member },
      }, [{ message: `C# NodeJS surface target call selected from checked provider module '${declaration.moduleSpecifier}'.` }]);
    },
  };
}

function selectSingleTargetMember(candidates: readonly TargetMember[]): TargetMember | undefined {
  return candidates.length === 1 ? candidates[0] : undefined;
}
