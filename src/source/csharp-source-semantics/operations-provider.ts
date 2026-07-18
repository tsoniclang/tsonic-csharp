import {
  TstsProviderContractVersion,
  deferObservation,
  rejectObservation,
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
  Type,
} from "@tsonic/tsts";
import type { CsharpObjectShapeFact } from "../csharp-facts.js";
import { csharpProviderDiagnostic } from "./diagnostics.js";
import {
  csharpJsSurfaceExtensionId,
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
import type {
  TargetTypescriptCompatibilityMode,
} from "@tsonic/target-api";
import {
  createCsharpJsSurfaceMappers,
} from "./surfaces/js/index.js";
import {
  mapCsharpCheckedCall,
} from "./checked-call-mapping/index.js";
import type {
  CsharpProviderOperationsContribution,
} from "./provider-packages/index.js";
import {
  mapCsharpCompatRuntimeCheckedCall,
  mapCsharpCompatRuntimeCheckedElementAccess,
  mapCsharpCompatRuntimeCheckedPropertyAccess,
} from "./compat-runtime-checked-operations.js";
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
} from "./checked-native-mapping.js";
import {
  observeCsharpPostCheckAssignability,
} from "./checked-assignability-validation/index.js";
import {
  validateCsharpTargetConstraint,
} from "./target-constraint-validation.js";
import {
  getSelectedSourceLibraryDeclarationName,
  resolveSourceLibraryMemberIdentity,
  resolveSelectedSourceLibraryMemberIdentity,
} from "./source-library.js";
import {
  getReferencedDeclarationTargetTypeRef,
} from "./referenced-declaration-target.js";
import {
  getCsharpCheckedPropertyAccessRequestContext,
} from "./checked-member-access-request-context.js";
import {
  checkedCallIsConstruction,
} from "./checked-call-request-context.js";
import {
  csharpOpaqueAnyOperationDiagnostic,
} from "./opaque-any-diagnostics/diagnostic.js";

export interface CsharpOperationsProviderHost {
  readonly getCsharpTargetBindingByTargetId: (targetId: string) => TargetBindingFact | undefined;
  readonly getCsharpTargetBindingByMetadataName: (metadataName: string) => TargetBindingFact | undefined;
  readonly getTargetTypeRefForSubject: (
    subject: ExtensionFactSubject | undefined,
    context: ExtensionObservationContext,
    options?: TargetTypeRefResolutionOptions,
  ) => TargetTypeRef | undefined;
  readonly getTargetTypeRefForType?: (
    type: Type | undefined,
    context: ExtensionObservationContext,
    options?: TargetTypeRefResolutionOptions,
  ) => TargetTypeRef | undefined;
  readonly getBaseTargetTypeRef?: (type: TargetTypeRef) => TargetTypeRef | undefined;
  readonly getAssignableTargetTypeRefs?: (type: TargetTypeRef) => readonly TargetTypeRef[];
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
  readonly providerOperationContributions?: readonly CsharpProviderOperationsContribution[];
  readonly typescriptCompatibilityMode?: TargetTypescriptCompatibilityMode;
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
  const providerOperationContributions = options.providerOperationContributions ?? [];
  const typescriptCompatibilityMode = options.typescriptCompatibilityMode ?? "strict-native";
  const surfaceAwareHost: CsharpOperationsProviderHost = {
    ...host,
    mapRuntimeCarrier(request, context) {
      const jsObservation = jsSurface?.mapRuntimeCarrier(request, context) ?? deferObservation;
      return jsObservation.kind === "defer"
        ? host.mapRuntimeCarrier(request, context)
        : jsObservation;
    },
  };
  return {
    identity,
    mapCheckedCall(request, context) {
      const compatObservation = typescriptCompatibilityMode === "compat"
        ? mapCsharpCompatRuntimeCheckedCall(request, context)
        : deferObservation;
      if (compatObservation.kind !== "defer") {
        return compatObservation;
      }
      if (request.sourceSelectedSignatureKind === "untyped") {
        const construction = checkedCallIsConstruction(request);
        return rejectObservation(csharpOpaqueAnyOperationDiagnostic(
          identity.id,
          construction
            ? { kind: "construct", description: "C# construct emission" }
            : { kind: "call", description: "C# call emission" },
          typescriptCompatibilityMode,
          request.call,
        ));
      }
      for (const contribution of providerOperationContributions) {
        const providerPackageObservation = contribution.mapCheckedCall?.(request, context) ?? deferObservation;
        if (providerPackageObservation.kind !== "defer") {
          return providerPackageObservation;
        }
      }
      const jsObservation = jsSurface?.mapCheckedCall(request, context) ?? deferObservation;
      const jsOwnsCall = jsSurface !== undefined && jsSurfaceOwnsCheckedCall(request, context);
      if (jsObservation.kind !== "defer" || jsOwnsCall) {
        return jsObservation;
      }
      return mapCsharpCheckedCall(request, context, identity.id, surfaceAwareHost);
    },
    mapCheckedPropertyAccess(request, context) {
      const compatObservation = typescriptCompatibilityMode === "compat"
        ? mapCsharpCompatRuntimeCheckedPropertyAccess(request, context)
        : deferObservation;
      if (compatObservation.kind !== "defer") {
        return compatObservation;
      }
      for (const contribution of providerOperationContributions) {
        const providerPackageObservation = contribution.mapCheckedPropertyAccess?.(request, context) ?? deferObservation;
        if (providerPackageObservation.kind !== "defer") {
          return providerPackageObservation;
        }
      }
      const jsObservation = jsSurface?.mapCheckedPropertyAccess(request, context) ?? deferObservation;
      if (jsObservation.kind !== "defer" || (jsSurface !== undefined && jsSurfaceOwnsCheckedPropertyAccess(request, context))) {
        return jsObservation;
      }
      return mapCsharpCheckedPropertyAccess(request, context, identity.id, surfaceAwareHost);
    },
    mapCheckedElementAccess(request, context) {
      const compatObservation = typescriptCompatibilityMode === "compat"
        ? mapCsharpCompatRuntimeCheckedElementAccess(request, context)
        : deferObservation;
      if (compatObservation.kind !== "defer") {
        return compatObservation;
      }
      for (const contribution of providerOperationContributions) {
        const providerPackageObservation = contribution.mapCheckedElementAccess?.(request, context) ?? deferObservation;
        if (providerPackageObservation.kind !== "defer") {
          return providerPackageObservation;
        }
      }
      const jsObservation = jsSurface?.mapCheckedElementAccess(request, context) ?? deferObservation;
      if (jsObservation.kind !== "defer" || (jsSurface !== undefined && jsSurfaceOwnsCheckedElementAccess(request, context))) {
        return jsObservation;
      }
      return mapCsharpCheckedElementAccess(request, context, identity.id, surfaceAwareHost);
    },
    mapCheckedOperator(request, context) {
      const jsObservation = jsSurface?.mapCheckedOperator(request, context) ?? deferObservation;
      if (jsObservation.kind !== "defer") {
        return jsObservation;
      }
      return mapCsharpCheckedOperator(request, context, surfaceAwareHost, typescriptCompatibilityMode);
    },
    observePostCheckAssignability(request, context) {
      return observeCsharpPostCheckAssignability(request, context, surfaceAwareHost);
    },
    validateTargetConstraint(request, context) {
      return validateCsharpTargetConstraint(request, context, surfaceAwareHost);
    },
    mapCheckedIteration(request, context) {
      return useObservationOrWhenDeferred(
        jsSurface?.mapCheckedIteration(request, context) ?? deferObservation,
        () => mapCsharpNativeCheckedIteration(request, context, surfaceAwareHost),
      );
    },
    recordContextualTargetType(request, context) {
      return mapCsharpContextualTargetType(request, context);
    },
    mapCheckedConversion(request, context) {
      return mapCsharpCheckedConversion(request, context, surfaceAwareHost, typescriptCompatibilityMode);
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
        readonly argumentTargetTypes?: readonly (TargetTypeRef | undefined)[];
        readonly receiver?: ExtensionFactSubject;
        readonly receiverTargetType?: TargetTypeRef;
        readonly sourceSelectionProven?: true;
        readonly sourceSelectedIdentity?: string;
      },
      context: ExtensionObservationContext,
      options: Pick<TargetMemberSelectionOptions, "declaringTargetType" | "declaringTypeParameters"> = {},
    ) =>
      selectTargetMember(candidates, request, context, (subject, resolutionContext, resolutionOptions) =>
        subject === undefined
          ? undefined
          : subject === request.receiver && request.receiverTargetType !== undefined
            ? request.receiverTargetType
          : request.argumentTargetTypes?.[request.arguments.indexOf(subject)] ??
            resolutionContext.factResolver.resolve(subject, selectedTargetSignatureFactKey)?.member.returnType ??
            resolutionContext.factResolver.resolve(subject, runtimeCarrierFactKey)?.carrier ??
            resolutionContext.facts.get(subject, selectedTargetSignatureFactKey)?.member.returnType ??
            resolutionContext.facts.get(subject, runtimeCarrierFactKey)?.carrier ??
            getReferencedDeclarationTargetTypeRef(subject, resolutionContext, host.getTargetTypeRefForSubject, resolutionOptions) ??
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
  return resolveSelectedSourceLibraryMemberIdentity(request.sourceCallee.selectedDeclaration, request.sourceCallee.selectedSymbol, context) !== undefined ||
    resolveSelectedSourceLibraryMemberIdentity(request.sourceSelectedDeclaration, undefined, context) !== undefined;
}

function jsSurfaceOwnsCheckedPropertyAccess(
  request: CheckedPropertyAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedPropertyAccess">,
): boolean {
  const requestContext = getCsharpCheckedPropertyAccessRequestContext(request, context);
  return resolveSourceLibraryMemberIdentity(request.sourceResult.selectedSymbol, context) !== undefined ||
    resolveSourceLibraryMemberIdentity(requestContext.sourceSelectedDeclaration, context) !== undefined;
}

function jsSurfaceOwnsCheckedElementAccess(
  request: CheckedElementAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedElementAccess">,
): boolean {
  return getSelectedSourceLibraryDeclarationName(request.sourceResult.selectedDeclaration, request.sourceResult.selectedSymbol, context) !== undefined;
}

export function useObservationOrWhenDeferred<T>(
  primary: ExtensionObservation<T>,
  whenDeferred: () => ExtensionObservation<T>,
): ExtensionObservation<T> {
  return primary.kind === "defer" ? whenDeferred() : primary;
}
