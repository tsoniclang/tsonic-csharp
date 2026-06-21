import {
  ExtensionLifecycleEvent,
  runtimeCarrierFactKey,
  sourcePrimitiveFactKey,
} from "@tsonic/tsts";
import type {
  BeforeSemanticsFinalizedLifecycleRequest,
  CompilerExtension,
  ExtensionFactStore,
  ExtensionFactSubject,
  ExtensionObservationContext,
  Node,
  SourceFileBoundLifecycleRequest,
  TargetTypeRef,
  Type,
} from "@tsonic/tsts";
import type {
  TargetProviderContext,
} from "@tsonic/target-api";
import type {
  CsharpObjectShapeFact,
} from "../csharp-facts.js";
import {
  createCsharpCoreVirtualModulesProvider,
} from "./core-virtual-modules.js";
import {
  csharpNativeProviderExtensionId,
  csharpProviderVersion,
  csharpTargetId,
} from "./identity.js";
import {
  csharpSourcePrimitiveTargetType,
} from "./target-types.js";
import type {
  TargetTypeRefResolutionOptions,
} from "./target-member-selection.js";
import {
  createCsharpNodejsSurfaceBindingProvider,
} from "./surfaces/nodejs/index.js";
import {
  createCsharpOperationsProvider,
} from "./operations-provider.js";
import {
  mapRuntimeCarrier as mapCsharpRuntimeCarrier,
  recordCsharpRuntimeCarrierFactsBeforeFinalization,
} from "./runtime-carriers.js";
import type {
  CsharpRuntimeCarrierSemanticsHost,
} from "./runtime-carriers.js";
import {
  resolveFunctionTargetTypeRefFromSignatureLikeSubject,
  resolveTargetTypeArgumentsForType,
  resolveTargetTypeRefForSubject,
  resolveTargetTypeRefForType,
} from "./target-type-resolution.js";
import type {
  CsharpSemanticTypeDeclarationShape,
  CsharpTargetTypeResolutionHost,
} from "./target-type-resolution.js";
import {
  getCsharpObjectShapeFactForSubject as resolveCsharpObjectShapeFactForSubject,
  getRecordedCsharpObjectShapeFactForSubject as resolveRecordedCsharpObjectShapeFactForSubject,
  getSemanticTypeDeclarationShape as resolveSemanticTypeDeclarationShape,
  getTargetTypeRefForSyntaxNode as resolveTargetTypeRefForSyntaxNode,
  recordCsharpSourceFileFacts,
} from "./object-shape-facts.js";
import type {
  CsharpObjectShapeSemanticsHost,
} from "./object-shape-facts.js";
import {
  recordCsharpObjectRestBindingFactsBeforeFinalization,
  recordCsharpObjectShapePropertyAccessFactsBeforeFinalization,
} from "./object-shape-lifecycle.js";
import type {
  CsharpObjectShapeLifecycleHost,
} from "./object-shape-lifecycle.js";
import {
  recordCsharpCheckedOperatorFactsBeforeFinalization,
} from "./checked-operator-lifecycle.js";
import type {
  CsharpCheckedOperatorLifecycleHost,
} from "./checked-operator-lifecycle.js";
import {
  createCsharpDotnetSystemTypeDataProvider,
  createDotnetTargetBindingProvider,
} from "../../providers/dotnet/index.js";

const targetTypeResolutionHost = {
  getCsharpObjectShapeFactForSubject,
  getSemanticTypeDeclarationShape,
} satisfies CsharpTargetTypeResolutionHost;

const objectShapeSemanticsHost = {
  getTargetTypeRefForSubject,
  getTargetTypeRefForType,
  getFunctionTargetTypeRefFromSignatureLikeSubject: (
    node: Node,
    context: ExtensionObservationContext,
    options: TargetTypeRefResolutionOptions,
  ) => resolveFunctionTargetTypeRefFromSignatureLikeSubject(node, context, options, targetTypeResolutionHost),
  getTargetTypeArgumentsForType: (
    type: Type,
    context: ExtensionObservationContext,
    options: TargetTypeRefResolutionOptions,
  ) => resolveTargetTypeArgumentsForType(type, context, options, targetTypeResolutionHost),
} satisfies CsharpObjectShapeSemanticsHost;

const objectShapeLifecycleHost = {
  getCsharpObjectShapeFactForSubject,
  getRecordedCsharpObjectShapeFactForSubject,
} satisfies CsharpObjectShapeLifecycleHost;

const checkedOperatorLifecycleHost = {
  getTargetTypeRefForSubject,
} satisfies CsharpCheckedOperatorLifecycleHost;

export function createCsharpNativeProviderExtension(context: TargetProviderContext): CompilerExtension {
  const selectedSurfaceIds = new Set(context.selectedSurfaces.map((surface) => surface.id));
  return {
    identity: {
      id: csharpNativeProviderExtensionId,
      version: csharpProviderVersion,
      capabilityNamespace: "tsonic.csharp.native",
    },
    composition: {
      kind: "target",
      target: csharpTargetId,
    },
    initialize(context): void {
      context.registerTargetBindingProvider(createCsharpCoreVirtualModulesProvider());
      context.registerTargetBindingProvider(createDotnetTargetBindingProvider({
        provider: createCsharpDotnetSystemTypeDataProvider(),
      }));
      if (selectedSurfaceIds.has("nodejs")) {
        context.registerTargetBindingProvider(createCsharpNodejsSurfaceBindingProvider());
      }
      const runtimeCarrierHost = {
        getTargetTypeRefForSubject,
        getTargetTypeRefForType,
        getTargetTypeRefForSyntaxNode,
        getCsharpObjectShapeFactForSubject,
        getRecordedCsharpObjectShapeFactForSubject,
      } satisfies CsharpRuntimeCarrierSemanticsHost;
      const provider = createCsharpOperationsProvider(selectedSurfaceIds, {
        getTargetTypeRefForSubject,
        getCsharpObjectShapeFactForSubject,
        mapRuntimeCarrier: (request, observationContext) => mapCsharpRuntimeCarrier(request, observationContext, runtimeCarrierHost),
      });
      context.registerTargetSemanticProvider(provider);
      context.registerLifecycleHook<SourceFileBoundLifecycleRequest>(ExtensionLifecycleEvent.afterSourceFileBound, (request, lifecycleContext) => {
        recordCsharpSourceFileFacts(request, context.facts, lifecycleContext.compiler?.ast);
      });
      context.registerLifecycleHook<BeforeSemanticsFinalizedLifecycleRequest>(ExtensionLifecycleEvent.beforeSemanticsFinalized, (_request, lifecycleContext) => {
        recordCsharpObjectRestBindingFactsBeforeFinalization(lifecycleContext, objectShapeLifecycleHost);
        recordCsharpObjectShapePropertyAccessFactsBeforeFinalization(lifecycleContext, objectShapeLifecycleHost);
        recordCsharpCheckedOperatorFactsBeforeFinalization(lifecycleContext, checkedOperatorLifecycleHost);
        recordCsharpRuntimeCarrierFactsBeforeFinalization(lifecycleContext, csharpTargetId, selectedSurfaceIds, runtimeCarrierHost);
      });
      context.factResolver.register(runtimeCarrierFactKey, (subject, resolverContext) => {
        const primitive = resolverContext.facts.get(subject, sourcePrimitiveFactKey);
        return primitive === undefined
          ? undefined
          : {
              value: {
                carrier: csharpSourcePrimitiveTargetType(primitive.kind),
              },
              evidence: [{ message: "C# primitive carrier resolved from finalized source primitive fact." }],
            };
      });
    },
  };
}

function getTargetTypeRefForSubject(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions = {},
): TargetTypeRef | undefined {
  return resolveTargetTypeRefForSubject(subject, context, options, targetTypeResolutionHost);
}

function getTargetTypeRefForType(
  type: Type | undefined,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions = {},
): TargetTypeRef | undefined {
  return resolveTargetTypeRefForType(type, context, options, targetTypeResolutionHost);
}

function getTargetTypeRefForSyntaxNode(
  node: Node | undefined,
  facts: ExtensionFactStore,
  ast?: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
): TargetTypeRef | undefined {
  return resolveTargetTypeRefForSyntaxNode(node, facts, ast);
}

function getCsharpObjectShapeFactForSubject(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): CsharpObjectShapeFact | undefined {
  return resolveCsharpObjectShapeFactForSubject(subject, context, objectShapeSemanticsHost);
}

function getRecordedCsharpObjectShapeFactForSubject(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): CsharpObjectShapeFact | undefined {
  return resolveRecordedCsharpObjectShapeFactForSubject(subject, context);
}

function getSemanticTypeDeclarationShape(
  type: Type,
  context: ExtensionObservationContext,
): CsharpSemanticTypeDeclarationShape | undefined {
  return resolveSemanticTypeDeclarationShape(type, context, objectShapeSemanticsHost);
}
