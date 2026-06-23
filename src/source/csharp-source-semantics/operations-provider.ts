import {
  TstsProviderContractVersion,
  deferObservation,
} from "@tsonic/tsts";
import type {
  ExtensionFactSubject,
  ExtensionObservation,
  ExtensionObservationContext,
  ProviderIdentity,
  RuntimeCarrierFactRequest,
  RuntimeCarrierFactResult,
  TargetBindingFact,
  TargetMember,
  TargetSemanticProvider,
  TargetTypeRef,
} from "@tsonic/tsts";
import type { CsharpObjectShapeFact } from "../csharp-facts.js";
import { csharpProviderDiagnostic } from "./diagnostics.js";
import { csharpProviderVersion, csharpTargetId } from "./identity.js";
import {
  isCsharpStringType,
  isIntegralTargetTypeRef,
  unwrapNullableTargetType,
} from "./target-rules.js";
import {
  isLiteralRepresentableAsTargetType,
  selectTargetMember,
} from "./target-member-selection.js";
import type { TargetTypeRefResolutionOptions } from "./target-member-selection.js";
import {
  createCsharpJsSurfaceMappers,
} from "./surfaces/js/index.js";
import {
  createCsharpNodejsSurfaceMappers,
} from "./surfaces/nodejs/index.js";
import {
  mapCsharpCheckedCall,
} from "./checked-call-mapping.js";
import {
  mapCsharpCheckedElementAccess,
  mapCsharpCheckedPropertyAccess,
} from "./checked-member-access-mapping.js";
import {
  mapCsharpCheckedOperator,
} from "./checked-operator-mapping.js";
import {
  mapCsharpCheckedConversion,
  mapCsharpContextualTargetType,
  mapCsharpNativeCheckedIteration,
  mapCsharpParameterPassing,
} from "./checked-native-mapping.js";
import {
  observeCsharpPostCheckAssignability,
} from "./checked-assignability-validation.js";

export interface CsharpOperationsProviderHost {
  readonly getCsharpTargetBindingByTargetId: (targetId: string) => TargetBindingFact | undefined;
  readonly getTargetTypeRefForSubject: (
    subject: ExtensionFactSubject | undefined,
    context: ExtensionObservationContext,
    options?: TargetTypeRefResolutionOptions,
  ) => TargetTypeRef | undefined;
  readonly getBaseTargetTypeRef?: (type: TargetTypeRef) => TargetTypeRef | undefined;
  readonly getCsharpObjectShapeFactForSubject: (
    subject: ExtensionFactSubject | undefined,
    context: ExtensionObservationContext,
  ) => CsharpObjectShapeFact | undefined;
  readonly mapRuntimeCarrier: (
    request: RuntimeCarrierFactRequest,
    context: ExtensionObservationContext<"type.resolveRuntimeCarrier">,
  ) => ExtensionObservation<RuntimeCarrierFactResult>;
}

export const csharpJsSurfaceOperationsProviderId = "tsonic.csharp.js.operations";
export const csharpNodejsSurfaceOperationsProviderId = "tsonic.csharp.nodejs.operations";

function createProviderIdentity(id: string, displayName: string): ProviderIdentity {
  return {
    id,
    version: csharpProviderVersion,
    target: csharpTargetId,
    extensionContractVersion: TstsProviderContractVersion,
    providerKind: "semantic",
    displayName,
  };
}

export function createCsharpNativeOperationsProvider(host: CsharpOperationsProviderHost): TargetSemanticProvider {
  const identity: ProviderIdentity = {
    id: "tsonic.csharp.operations",
    version: csharpProviderVersion,
    target: csharpTargetId,
    extensionContractVersion: TstsProviderContractVersion,
    providerKind: "semantic",
    displayName: "Tsonic C# semantic mapper",
  };
  return {
    identity,
    resolveRuntimeCarrier(request, context) {
      if (request.target !== undefined && request.target !== csharpTargetId) {
        return deferObservation;
      }
      return host.mapRuntimeCarrier(request, context);
    },
    mapCheckedCall(request, context) {
      return mapCsharpCheckedCall(request, context, identity.id, host);
    },
    mapCheckedPropertyAccess(request, context) {
      return mapCsharpCheckedPropertyAccess(request, context, identity.id, host);
    },
    mapCheckedElementAccess(request, context) {
      return mapCsharpCheckedElementAccess(request, context, identity.id, host);
    },
    mapCheckedOperator(request, context) {
      return mapCsharpCheckedOperator(request, context, host);
    },
    observePostCheckAssignability(request, context) {
      return observeCsharpPostCheckAssignability(request, context, host);
    },
    mapCheckedIteration(request, context) {
      return mapCsharpNativeCheckedIteration(request, context, host);
    },
    recordContextualTargetType(request, context) {
      return mapCsharpContextualTargetType(request, context, host);
    },
    mapCheckedConversion(request, context) {
      return mapCsharpCheckedConversion(request, context, host);
    },
    resolveParameterPassing(request, context) {
      return mapCsharpParameterPassing(request, context);
    },
  };
}

export function createCsharpJsSurfaceOperationsProvider(host: CsharpOperationsProviderHost): TargetSemanticProvider {
  const identity = createProviderIdentity(
    csharpJsSurfaceOperationsProviderId,
    "Tsonic C# JavaScript surface semantic mapper",
  );
  const jsSurface = createCsharpJsSurfaceMappers(createCsharpJsSurfaceHost(identity.id, host));
  return {
    identity,
    resolveRuntimeCarrier: jsSurface.mapRuntimeCarrier,
    mapCheckedCall: jsSurface.mapCheckedCall,
    mapCheckedPropertyAccess: jsSurface.mapCheckedPropertyAccess,
    mapCheckedElementAccess: jsSurface.mapCheckedElementAccess,
    mapCheckedIteration: jsSurface.mapCheckedIteration,
  };
}

export function createCsharpNodejsSurfaceOperationsProvider(): TargetSemanticProvider {
  const identity = createProviderIdentity(
    csharpNodejsSurfaceOperationsProviderId,
    "Tsonic C# Node.js surface semantic mapper",
  );
  const nodejsSurface = createCsharpNodejsSurfaceMappers(identity.id);
  return {
    identity,
    mapCheckedCall: nodejsSurface.mapCheckedCall,
    mapCheckedPropertyAccess: nodejsSurface.mapCheckedPropertyAccess,
  };
}

export function createCsharpJsSurfaceHost(
  extensionId: string,
  host: Pick<
    CsharpOperationsProviderHost,
    "getTargetTypeRefForSubject" | "getBaseTargetTypeRef" | "getCsharpObjectShapeFactForSubject" | "mapRuntimeCarrier"
  > & Partial<Pick<CsharpOperationsProviderHost, "getCsharpTargetBindingByTargetId">>,
) {
  return {
    targetId: csharpTargetId,
    extensionId,
    ...(host.getCsharpTargetBindingByTargetId === undefined ? {} : { getCsharpTargetBindingByTargetId: host.getCsharpTargetBindingByTargetId }),
    getTargetTypeRefForSubject: host.getTargetTypeRefForSubject,
    unwrapNullableTargetType,
    isCsharpStringType,
    isIntegralTargetTypeRef,
    isLiteralRepresentableAsTargetType,
    selectTargetMember: (
      candidates: readonly TargetMember[],
      request: {
        readonly arguments: readonly ExtensionFactSubject[];
        readonly receiver?: ExtensionFactSubject;
      },
      context: ExtensionObservationContext,
    ) =>
      selectTargetMember(candidates, request, context, host.getTargetTypeRefForSubject, {
        getBaseTargetTypeRef: host.getBaseTargetTypeRef,
      }),
    getCsharpObjectShapeFactForSubject: host.getCsharpObjectShapeFactForSubject,
    csharpProviderDiagnostic,
  };
}

export function useObservationOrWhenDeferred<T>(
  primary: ExtensionObservation<T>,
  whenDeferred: () => ExtensionObservation<T>,
): ExtensionObservation<T> {
  return primary.kind === "defer" ? whenDeferred() : primary;
}
