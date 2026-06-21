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

export interface CsharpOperationsProviderHost {
  readonly getTargetTypeRefForSubject: (
    subject: ExtensionFactSubject | undefined,
    context: ExtensionObservationContext,
    options?: TargetTypeRefResolutionOptions,
  ) => TargetTypeRef | undefined;
  readonly getCsharpObjectShapeFactForSubject: (
    subject: ExtensionFactSubject | undefined,
    context: ExtensionObservationContext,
  ) => CsharpObjectShapeFact | undefined;
  readonly mapRuntimeCarrier: (
    request: RuntimeCarrierFactRequest,
    context: ExtensionObservationContext<"type.resolveRuntimeCarrier">,
  ) => ExtensionObservation<RuntimeCarrierFactResult>;
}

export function createCsharpOperationsProvider(
  selectedSurfaceIds: ReadonlySet<string>,
  host: CsharpOperationsProviderHost,
): TargetSemanticProvider {
  const identity: ProviderIdentity = {
    id: "tsonic.csharp.operations",
    version: csharpProviderVersion,
    target: csharpTargetId,
    extensionContractVersion: TstsProviderContractVersion,
    providerKind: "semantic",
    displayName: "Tsonic C# semantic mapper",
  };
  const jsSurfaceEnabled = selectedSurfaceIds.has("js");
  const nodejsSurfaceEnabled = selectedSurfaceIds.has("nodejs");
  const jsSurface = createCsharpJsSurfaceMappers(createCsharpJsSurfaceHost(identity.id, host));
  const nodejsSurface = createCsharpNodejsSurfaceMappers(identity.id);
  return {
    identity,
    resolveRuntimeCarrier(request, context) {
      if (request.target !== undefined && request.target !== csharpTargetId) {
        return deferObservation;
      }
      return useObservationOrWhenDeferred(
        host.mapRuntimeCarrier(request, context),
        () => jsSurfaceEnabled ? jsSurface.mapRuntimeCarrier(request, context) : deferObservation,
      );
    },
    mapCheckedCall(request, context) {
      return useObservationOrWhenDeferred(
        nodejsSurfaceEnabled ? nodejsSurface.mapCheckedCall(request, context) : deferObservation,
        () => useObservationOrWhenDeferred(
          mapCsharpCheckedCall(request, context, identity.id, host),
          () => jsSurfaceEnabled ? jsSurface.mapCheckedCall(request, context) : deferObservation,
        ),
      );
    },
    mapCheckedPropertyAccess(request, context) {
      return useObservationOrWhenDeferred(
        nodejsSurfaceEnabled ? nodejsSurface.mapCheckedPropertyAccess(request, context) : deferObservation,
        () => useObservationOrWhenDeferred(
          mapCsharpCheckedPropertyAccess(request, context, identity.id, host),
          () => jsSurfaceEnabled ? jsSurface.mapCheckedPropertyAccess(request, context) : deferObservation,
        ),
      );
    },
    mapCheckedElementAccess(request, context) {
      return useObservationOrWhenDeferred(
        mapCsharpCheckedElementAccess(request, context, identity.id, host),
        () => jsSurfaceEnabled ? jsSurface.mapCheckedElementAccess(request, context) : deferObservation,
      );
    },
    mapCheckedOperator(request, context) {
      return mapCsharpCheckedOperator(request, context, host);
    },
    mapCheckedIteration(request, context) {
      return useObservationOrWhenDeferred(
        mapCsharpNativeCheckedIteration(request, context, host),
        () => jsSurfaceEnabled ? jsSurface.mapCheckedIteration(request, context) : deferObservation,
      );
    },
    recordContextualTargetType(request, context) {
      return mapCsharpContextualTargetType(request, context);
    },
    mapCheckedConversion(request, context) {
      return mapCsharpCheckedConversion(request, context, host);
    },
    resolveParameterPassing(request, context) {
      return mapCsharpParameterPassing(request, context);
    },
  };
}

export function createCsharpJsSurfaceHost(extensionId: string, host: CsharpOperationsProviderHost) {
  return {
    targetId: csharpTargetId,
    extensionId,
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
      selectTargetMember(candidates, request, context, host.getTargetTypeRefForSubject),
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
