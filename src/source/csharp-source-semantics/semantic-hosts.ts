import type {
  ExtensionFactStore,
  ExtensionFactSubject,
  ExtensionObservationContext,
  Node,
  TargetTypeRef,
  Type,
} from "@tsonic/tsts";
import type {
  TargetTypescriptCompatibilityMode,
  TargetProviderContext,
} from "@tsonic/target-api";
import type {
  CsharpObjectShapeFact,
} from "../csharp-facts.js";
import {
  createDotnetReflectionTypeDataProvider,
} from "../../providers/dotnet/index.js";
import {
  readCsharpTypescriptCompatibilityMode,
  readCsharpReflectionReferencePaths,
  readCsharpTargetFramework,
} from "../../options/csharp-target-options.js";
import {
  csharpBaseTargetTypeFromBinding,
  csharpExceptionTargetType,
} from "./target-types.js";
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
import type {
  TargetTypeRefResolutionOptions,
} from "./target-member-selection.js";
import {
  getCsharpObjectShapeFactForSubject as resolveCsharpObjectShapeFactForSubject,
  getRecordedCsharpObjectShapeFactForSubject as resolveRecordedCsharpObjectShapeFactForSubject,
  getSemanticTypeDeclarationShape as resolveSemanticTypeDeclarationShape,
} from "./object-shape-facts.js";
import type {
  CsharpObjectShapeSemanticsHost,
} from "./object-shape-facts.js";
import type {
  CsharpObjectShapeLifecycleHost,
} from "./object-shape-lifecycle.js";
import type {
  CsharpCheckedOperatorLifecycleHost,
} from "./checked-operator-lifecycle.js";
import type {
  CsharpRuntimeCarrierSemanticsHost,
} from "./runtime-carriers.js";
import {
  mapRuntimeCarrier as mapCsharpRuntimeCarrier,
} from "./runtime-carriers.js";
import {
  getTargetTypeRefForSyntaxNode as resolveTargetTypeRefForSyntaxNode,
} from "./object-shape-facts.js";
import type {
  CsharpOperationsProviderHost,
} from "./operations-provider.js";

export interface CsharpExtensionSemanticHosts {
  readonly typescriptCompatibilityMode: TargetTypescriptCompatibilityMode;
  readonly dotnetReflectionReferences: readonly string[];
  readonly dotnetTargetFramework: string | undefined;
  readonly dotnetProvider: ReturnType<typeof createDotnetReflectionTypeDataProvider>;
  readonly targetTypeResolutionHost: CsharpTargetTypeResolutionHost;
  readonly objectShapeSemanticsHost: CsharpObjectShapeSemanticsHost;
  readonly objectShapeLifecycleHost: CsharpObjectShapeLifecycleHost;
  readonly checkedOperatorLifecycleHost: CsharpCheckedOperatorLifecycleHost;
  readonly runtimeCarrierHost: CsharpRuntimeCarrierSemanticsHost;
  readonly operationsProviderHost: CsharpOperationsProviderHost & CsharpTargetTypeResolutionHost & {
    readonly getTargetTypeRefForType: (
      type: Type | undefined,
      context: ExtensionObservationContext,
      options?: TargetTypeRefResolutionOptions,
    ) => TargetTypeRef | undefined;
  };
}

export function createCsharpExtensionSemanticHosts(context: Pick<TargetProviderContext, "target">): CsharpExtensionSemanticHosts {
  const typescriptCompatibilityMode = readCsharpTypescriptCompatibilityMode(context.target);
  const dotnetReflectionReferences = readCsharpReflectionReferencePaths(context.target);
  const dotnetTargetFramework = readCsharpTargetFramework(context.target);
  const dotnetProvider = createDotnetReflectionTypeDataProvider({
    references: dotnetReflectionReferences,
    targetFramework: dotnetTargetFramework,
  });
  let objectShapeSemanticsHost: CsharpObjectShapeSemanticsHost;
  const targetTypeResolutionHost = {
    getCsharpTargetBindingByTargetId: (targetId: string) => dotnetProvider.findTargetBindingByTargetId(targetId),
    getCsharpTargetBindingByMetadataName: (metadataName: string) => dotnetProvider.findTargetBindingByMetadataName(metadataName),
    getCatchExceptionTargetTypeRef: () => csharpExceptionTargetType(),
    getBaseTargetTypeRef: (type: TargetTypeRef) => {
      if (type.kind !== "target-named") {
        return undefined;
      }
      const binding = dotnetProvider.findTargetBindingByTargetId(type.id);
      return binding === undefined
        ? undefined
        : csharpBaseTargetTypeFromBinding(binding, type.typeArguments ?? []);
    },
    getCsharpObjectShapeFactForSubject,
    getSemanticTypeDeclarationShape,
  } satisfies CsharpTargetTypeResolutionHost;
  const getTargetTypeRefForSubject = (
    subject: ExtensionFactSubject | undefined,
    context: ExtensionObservationContext,
    options: TargetTypeRefResolutionOptions = {},
  ): TargetTypeRef | undefined => resolveTargetTypeRefForSubject(subject, context, options, targetTypeResolutionHost);
  const getTargetTypeRefForType = (
    type: Type | undefined,
    context: ExtensionObservationContext,
    options: TargetTypeRefResolutionOptions = {},
  ): TargetTypeRef | undefined => resolveTargetTypeRefForType(type, context, options, targetTypeResolutionHost);
  const getTargetTypeRefForSyntaxNode = (
    node: Node | undefined,
    facts: ExtensionFactStore,
    ast?: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  ): TargetTypeRef | undefined => resolveTargetTypeRefForSyntaxNode(node, facts, ast);
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
  objectShapeSemanticsHost = {
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
  };
  const objectShapeLifecycleHost = {
    getCsharpObjectShapeFactForSubject,
    getRecordedCsharpObjectShapeFactForSubject,
  } satisfies CsharpObjectShapeLifecycleHost;
  const checkedOperatorLifecycleHost = {
    getTargetTypeRefForSubject,
  } satisfies CsharpCheckedOperatorLifecycleHost;
  const runtimeCarrierHost = {
    getTargetTypeRefForSubject,
    getTargetTypeRefForType,
    getTargetTypeRefForSyntaxNode,
    getCatchExceptionTargetTypeRef: targetTypeResolutionHost.getCatchExceptionTargetTypeRef,
    getCsharpObjectShapeFactForSubject,
    getRecordedCsharpObjectShapeFactForSubject,
  } satisfies CsharpRuntimeCarrierSemanticsHost;
  const operationsProviderHost = {
    getCsharpTargetBindingByTargetId: targetTypeResolutionHost.getCsharpTargetBindingByTargetId,
    getCsharpTargetBindingByMetadataName: targetTypeResolutionHost.getCsharpTargetBindingByMetadataName,
    getBaseTargetTypeRef: targetTypeResolutionHost.getBaseTargetTypeRef,
    getSemanticTypeDeclarationShape: targetTypeResolutionHost.getSemanticTypeDeclarationShape,
    getTargetTypeRefForSubject,
    getTargetTypeRefForType,
    getCsharpObjectShapeFactForSubject,
    mapRuntimeCarrier: (request, observationContext) => mapCsharpRuntimeCarrier(request, observationContext, runtimeCarrierHost),
  } satisfies CsharpOperationsProviderHost & CsharpTargetTypeResolutionHost & { readonly getTargetTypeRefForType: typeof getTargetTypeRefForType };

  return {
    typescriptCompatibilityMode,
    dotnetReflectionReferences,
    dotnetTargetFramework,
    dotnetProvider,
    targetTypeResolutionHost,
    objectShapeSemanticsHost,
    objectShapeLifecycleHost,
    checkedOperatorLifecycleHost,
    runtimeCarrierHost,
    operationsProviderHost,
  };
}
