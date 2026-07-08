import {
  TstsProviderContractVersion,
  acceptObservation,
  deferObservation,
  runtimeCarrierFactKey,
  selectedTargetSignatureFactKey,
} from "@tsonic/tsts";
import type {
  CheckedCallMappingRequest,
  CheckedElementAccessMappingRequest,
  CheckedOperationMappingResult,
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
  recordCsharpJsDateRuntimeCarrierFactsBeforeFinalization,
} from "./surfaces/js/date/index.js";
import {
  recordCsharpJsJsonRuntimeCarrierFactsBeforeFinalization,
} from "./surfaces/js/json.js";
import {
  recordCsharpJsRegExpRuntimeCarrierFactsBeforeFinalization,
} from "./surfaces/js/regexp/index.js";
import {
  mapCsharpCheckedCall,
} from "./checked-call-mapping/index.js";
import type {
  CsharpProviderPackageOperationsMapper,
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
  targetOperation,
} from "./operations.js";
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
  asNodeSubject,
  isDeclarationOrVirtualSourceFile,
} from "./ast-utils.js";

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
  readonly providerPackageMappers?: readonly CsharpProviderPackageOperationsMapper[];
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
  const providerPackageMappers = options.providerPackageMappers ?? [];
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
      for (const providerPackageMapper of providerPackageMappers) {
        const providerPackageObservation = providerPackageMapper.mapCheckedCall?.(request, context) ?? deferObservation;
        if (providerPackageObservation.kind !== "defer") {
          return providerPackageObservation;
        }
      }
      if (jsSurface !== undefined) {
        ensureCsharpJsSurfaceSeedFacts(context, createCsharpJsSurfaceHost(csharpJsSurfaceExtensionId, surfaceAwareHost));
      }
      const jsObservation = jsSurface?.mapCheckedCall(request, context) ?? deferObservation;
      const jsOwnsCall = jsSurface !== undefined && jsSurfaceOwnsCheckedCall(request, context);
      if (jsObservation.kind !== "defer" || jsOwnsCall) {
        return jsObservation;
      }
      return mapCsharpCheckedCall(request, context, identity.id, surfaceAwareHost);
    },
    mapCheckedPropertyAccess(request, context) {
      if (isDeclarationOrVirtualRequestSubject(request.expression, context)) {
        return acceptDeclarationOnlyOperation("property");
      }
      const compatObservation = typescriptCompatibilityMode === "compat"
        ? mapCsharpCompatRuntimeCheckedPropertyAccess(request, context)
        : deferObservation;
      if (compatObservation.kind !== "defer") {
        return compatObservation;
      }
      if (jsSurface !== undefined) {
        ensureCsharpJsSurfaceSeedFacts(context, createCsharpJsSurfaceHost(csharpJsSurfaceExtensionId, surfaceAwareHost));
      }
      for (const providerPackageMapper of providerPackageMappers) {
        const providerPackageObservation = providerPackageMapper.mapCheckedPropertyAccess?.(request, context) ?? deferObservation;
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
      if (isDeclarationOrVirtualRequestSubject(request.expression, context)) {
        return acceptDeclarationOnlyOperation("indexer");
      }
      const compatObservation = typescriptCompatibilityMode === "compat"
        ? mapCsharpCompatRuntimeCheckedElementAccess(request, context)
        : deferObservation;
      if (compatObservation.kind !== "defer") {
        return compatObservation;
      }
      for (const providerPackageMapper of providerPackageMappers) {
        const providerPackageObservation = providerPackageMapper.mapCheckedElementAccess?.(request, context) ?? deferObservation;
        if (providerPackageObservation.kind !== "defer") {
          return providerPackageObservation;
        }
      }
      if (jsSurface !== undefined) {
        ensureCsharpJsSurfaceSeedFacts(context, createCsharpJsSurfaceHost(csharpJsSurfaceExtensionId, surfaceAwareHost));
      }
      const jsObservation = jsSurface?.mapCheckedElementAccess(request, context) ?? deferObservation;
      if (jsObservation.kind !== "defer" || (jsSurface !== undefined && jsSurfaceOwnsCheckedElementAccess(request, context))) {
        return jsObservation;
      }
      return mapCsharpCheckedElementAccess(request, context, identity.id, surfaceAwareHost);
    },
    mapCheckedOperator(request, context) {
      if (isDeclarationOrVirtualRequestSubject(request.expression, context)) {
        return acceptDeclarationOnlyOperation("operator");
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
      if (isDeclarationOrVirtualRequestSubject(request.statement, context)) {
        return acceptDeclarationOnlyOperation("iteration");
      }
      return useObservationOrWhenDeferred(
        jsSurface?.mapCheckedIteration(request, context) ?? deferObservation,
        () => mapCsharpNativeCheckedIteration(request, context, surfaceAwareHost),
      );
    },
    recordContextualTargetType(request, context) {
      return mapCsharpContextualTargetType(request, context, surfaceAwareHost);
    },
    mapCheckedConversion(request, context) {
      return mapCsharpCheckedConversion(request, context, surfaceAwareHost);
    },
  };
}

const jsSurfaceSeededFactHosts = new WeakSet<object>();

function ensureCsharpJsSurfaceSeedFacts(
  context: ExtensionObservationContext,
  host: ReturnType<typeof createCsharpJsSurfaceHost>,
): void {
  const factHost = context.host;
  if (factHost === undefined || context.compiler === undefined || jsSurfaceSeededFactHosts.has(factHost)) {
    return;
  }
  jsSurfaceSeededFactHosts.add(factHost);
  const lifecycleContext = {
    host: factHost,
    compiler: context.compiler,
  };
  recordCsharpJsRegExpRuntimeCarrierFactsBeforeFinalization(lifecycleContext);
  recordCsharpJsDateRuntimeCarrierFactsBeforeFinalization(lifecycleContext);
  recordCsharpJsJsonRuntimeCarrierFactsBeforeFinalization(lifecycleContext, host);
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
        readonly sourceSelectedSignature?: unknown;
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
  return resolveSelectedSourceLibraryMemberIdentity(request.sourceCalleeDeclaration, request.sourceCalleeSymbol, context) !== undefined ||
    resolveSelectedSourceLibraryMemberIdentity(request.sourceSelectedDeclaration, undefined, context) !== undefined;
}

function jsSurfaceOwnsCheckedPropertyAccess(
  request: CheckedPropertyAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedPropertyAccess">,
): boolean {
  const requestContext = getCsharpCheckedPropertyAccessRequestContext(request, context);
  return resolveSourceLibraryMemberIdentity(request.sourceSelectedSymbol, context) !== undefined ||
    resolveSourceLibraryMemberIdentity(requestContext.sourceSelectedDeclaration, context) !== undefined;
}

function jsSurfaceOwnsCheckedElementAccess(
  request: CheckedElementAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedElementAccess">,
): boolean {
  return getSelectedSourceLibraryDeclarationName(request.sourceSelectedDeclaration, request.sourceSelectedSymbol, context) !== undefined;
}

function isDeclarationOrVirtualRequestSubject(
  subject: ExtensionFactSubject,
  context: ExtensionObservationContext,
): boolean {
  const node = asNodeSubject(subject);
  if (node === undefined) {
    return false;
  }
  const sourceFile = context.compiler.ast.getSourceFile(node);
  return sourceFile === undefined || isDeclarationOrVirtualSourceFile(sourceFile, context.compiler.ast);
}

function acceptDeclarationOnlyOperation(
  operationKind: CheckedOperationMappingResult["operation"]["operationKind"],
): ExtensionObservation<CheckedOperationMappingResult> {
  return acceptObservation({
    operation: targetOperation(
      `tsonic.csharp.declaration-only.${operationKind}`,
      operationKind,
      "declaration-only",
    ),
  }, [{ message: "C# operation mapping accepted a declaration/virtual source operation without target emission semantics." }]);
}

export function useObservationOrWhenDeferred<T>(
  primary: ExtensionObservation<T>,
  whenDeferred: () => ExtensionObservation<T>,
): ExtensionObservation<T> {
  return primary.kind === "defer" ? whenDeferred() : primary;
}
