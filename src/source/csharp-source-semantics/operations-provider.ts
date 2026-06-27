import {
  TstsProviderContractVersion,
  deferObservation,
  runtimeCarrierFactKey,
  selectedTargetSignatureFactKey,
} from "@tsonic/tsts";
import type {
  CheckedCallMappingRequest,
  CheckedElementAccessMappingRequest,
  CheckedPropertyAccessMappingRequest,
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
import {
  csharpJsSurfaceExtensionId,
  csharpNodejsSurfaceExtensionId,
  csharpProviderVersion,
  csharpTargetId,
} from "./identity.js";
import {
  isCsharpStringType,
  isIntegralTargetTypeRef,
  unwrapNullableTargetType,
} from "./target-rules.js";
import {
  isLiteralRepresentableAsTargetType,
  selectTargetMember,
} from "./target-member-selection.js";
import type { TargetMemberSelectionOptions, TargetTypeRefResolutionOptions } from "./target-member-selection.js";
import {
  createCsharpJsSurfaceMappers,
} from "./surfaces/js/index.js";
import {
  createCsharpNodejsSurfaceMappers,
} from "./surfaces/nodejs/index.js";
import {
  mapCsharpCheckedCall,
} from "./checked-call-mapping/index.js";
import {
  mapCsharpCheckedElementAccess,
  mapCsharpCheckedPropertyAccess,
} from "./checked-member-access-mapping.js";
import {
  mapCsharpCheckedOperator,
} from "./checked-operator-mapping/index.js";
import {
  mapCsharpCheckedConversion,
  mapCsharpContextualTargetType,
  mapCsharpNativeCheckedIteration,
  mapCsharpParameterPassing,
} from "./checked-native-mapping.js";
import {
  observeCsharpPostCheckAssignability,
} from "./checked-assignability-validation/index.js";
import {
  validateCsharpTargetConstraint,
} from "./target-constraint-validation.js";
import {
  resolveSourceLibraryMemberIdentity,
} from "./source-library.js";
import {
  isSourceStandardLibraryArrayLikeType,
} from "./source-type-classification.js";
import {
  asSemanticType,
} from "../fact-subjects.js";

export interface CsharpOperationsProviderHost {
  readonly getCsharpTargetBindingByTargetId: (targetId: string) => TargetBindingFact | undefined;
  readonly getCsharpTargetBindingByMetadataName: (metadataName: string) => TargetBindingFact | undefined;
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

export function createCsharpNativeOperationsProvider(host: CsharpOperationsProviderHost): TargetSemanticProvider {
  return createCsharpTargetOperationsProvider(host, {});
}

export interface CsharpTargetOperationsProviderOptions {
  readonly jsSurface?: boolean;
  readonly nodejsSurface?: boolean;
}

export function createCsharpTargetOperationsProvider(
  host: CsharpOperationsProviderHost,
  options: CsharpTargetOperationsProviderOptions,
): TargetSemanticProvider {
  const identity: ProviderIdentity = {
    id: "tsonic.csharp.operations",
    version: csharpProviderVersion,
    target: csharpTargetId,
    extensionContractVersion: TstsProviderContractVersion,
    providerKind: "semantic",
    displayName: "Tsonic C# semantic mapper",
  };
  const jsSurface = options.jsSurface === true
    ? createCsharpJsSurfaceMappers(createCsharpJsSurfaceHost(csharpJsSurfaceExtensionId, host))
    : undefined;
  const nodejsSurface = options.nodejsSurface === true
    ? createCsharpNodejsSurfaceMappers(csharpNodejsSurfaceExtensionId)
    : undefined;
  return {
    identity,
    resolveRuntimeCarrier(request, context) {
      if (request.target !== undefined && request.target !== csharpTargetId) {
        return deferObservation;
      }
      return useObservationOrWhenDeferred(
        jsSurface?.mapRuntimeCarrier(request, context) ?? deferObservation,
        () => host.mapRuntimeCarrier(request, context),
      );
    },
    mapCheckedCall(request, context) {
      const nodejsObservation = nodejsSurface?.mapCheckedCall(request, context) ?? deferObservation;
      if (nodejsObservation.kind !== "defer") {
        return nodejsObservation;
      }
      const jsObservation = jsSurface?.mapCheckedCall(request, context) ?? deferObservation;
      if (jsObservation.kind !== "defer" || (jsSurface !== undefined && jsSurfaceOwnsCheckedCall(request, context))) {
        return jsObservation;
      }
      return mapCsharpCheckedCall(request, context, identity.id, host);
    },
    mapCheckedPropertyAccess(request, context) {
      const nodejsObservation = nodejsSurface?.mapCheckedPropertyAccess(request, context) ?? deferObservation;
      if (nodejsObservation.kind !== "defer") {
        return nodejsObservation;
      }
      const jsObservation = jsSurface?.mapCheckedPropertyAccess(request, context) ?? deferObservation;
      if (jsObservation.kind !== "defer" || (jsSurface !== undefined && jsSurfaceOwnsCheckedPropertyAccess(request, context))) {
        return jsObservation;
      }
      return mapCsharpCheckedPropertyAccess(request, context, identity.id, host);
    },
    mapCheckedElementAccess(request, context) {
      const jsObservation = jsSurface?.mapCheckedElementAccess(request, context) ?? deferObservation;
      if (jsObservation.kind !== "defer" || (jsSurface !== undefined && jsSurfaceOwnsCheckedElementAccess(request, context))) {
        return jsObservation;
      }
      return mapCsharpCheckedElementAccess(request, context, identity.id, host);
    },
    mapCheckedOperator(request, context) {
      return mapCsharpCheckedOperator(request, context, host);
    },
    observePostCheckAssignability(request, context) {
      return observeCsharpPostCheckAssignability(request, context, host);
    },
    validateTargetConstraint(request, context) {
      return validateCsharpTargetConstraint(request, context, host);
    },
    mapCheckedIteration(request, context) {
      return useObservationOrWhenDeferred(
        jsSurface?.mapCheckedIteration(request, context) ?? deferObservation,
        () => mapCsharpNativeCheckedIteration(request, context, host),
      );
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

export function createCsharpJsSurfaceHost(
  extensionId: string,
  host: Pick<
    CsharpOperationsProviderHost,
    "getTargetTypeRefForSubject" | "getBaseTargetTypeRef" | "getCsharpObjectShapeFactForSubject" | "mapRuntimeCarrier"
  > & Partial<Pick<CsharpOperationsProviderHost, "getCsharpTargetBindingByTargetId" | "getCsharpTargetBindingByMetadataName">>,
) {
  return {
    targetId: csharpTargetId,
    extensionId,
    ...(host.getCsharpTargetBindingByTargetId === undefined ? {} : { getCsharpTargetBindingByTargetId: host.getCsharpTargetBindingByTargetId }),
    ...(host.getCsharpTargetBindingByMetadataName === undefined ? {} : { getCsharpTargetBindingByMetadataName: host.getCsharpTargetBindingByMetadataName }),
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
        readonly sourceSelectedSignature?: unknown;
      },
      context: ExtensionObservationContext,
      options: Pick<TargetMemberSelectionOptions, "declaringTargetType" | "declaringTypeParameters"> = {},
    ) =>
      selectTargetMember(candidates, request, context, (subject, resolutionContext, resolutionOptions) =>
        subject === undefined
          ? undefined
          : resolutionContext.factResolver.resolve(subject, selectedTargetSignatureFactKey)?.member.returnType ??
            resolutionContext.factResolver.resolve(subject, runtimeCarrierFactKey)?.carrier ??
            resolutionContext.facts.get(subject, selectedTargetSignatureFactKey)?.member.returnType ??
            resolutionContext.facts.get(subject, runtimeCarrierFactKey)?.carrier ??
            host.getTargetTypeRefForSubject(subject, resolutionContext, resolutionOptions), {
        getBaseTargetTypeRef: host.getBaseTargetTypeRef,
        ...options,
      }),
    getCsharpObjectShapeFactForSubject: host.getCsharpObjectShapeFactForSubject,
    csharpProviderDiagnostic,
  };
}

function jsSurfaceOwnsCheckedCall(
  request: CheckedCallMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedCall">,
): boolean {
  return resolveSourceLibraryMemberIdentity(request.sourceSelectedDeclaration, context) !== undefined;
}

function jsSurfaceOwnsCheckedPropertyAccess(
  request: CheckedPropertyAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedPropertyAccess">,
): boolean {
  return resolveSourceLibraryMemberIdentity(request.sourceSelectedDeclaration, context) !== undefined;
}

function jsSurfaceOwnsCheckedElementAccess(
  request: CheckedElementAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedElementAccess">,
): boolean {
  const receiverType = asSemanticType(request.receiverType);
  return receiverType !== undefined && isSourceStandardLibraryArrayLikeType(receiverType, context);
}

export function useObservationOrWhenDeferred<T>(
  primary: ExtensionObservation<T>,
  whenDeferred: () => ExtensionObservation<T>,
): ExtensionObservation<T> {
  return primary.kind === "defer" ? whenDeferred() : primary;
}
