import type {
  ExtensionFactStore,
  ExtensionFactSubject,
  ExtensionObservationContext,
  Node,
  TargetBindingFact,
  TargetConstraint,
  TargetTypeRef,
  Type,
} from "@tsonic/tsts";
import type {
  TargetTypescriptCompatibilityMode,
  TargetProviderContext,
} from "@tsonic/target-api";
import { fileURLToPath } from "node:url";
import type {
  CsharpObjectShapeFact,
} from "../csharp-facts.js";
import {
  dotnetModuleSpecifierPolicy,
  createDotnetReflectionTypeDataProvider,
} from "../../providers/dotnet/index.js";
import type {
  DotnetModuleSpecifierPolicy,
  DotnetReflectionTypeDataProvider,
} from "../../providers/dotnet/index.js";
import {
  readCsharpTypescriptCompatibilityMode,
  readCsharpReflectionReferencePaths,
  readCsharpTargetFramework,
} from "../../options/csharp-target-options.js";
import {
  csharpBaseTargetTypeFromBinding,
  csharpExceptionTargetType,
  csharpTsValueTargetType,
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
import {
  substituteTargetTypeRef,
} from "./target-member-arguments/type-substitution.js";
import {
  createCsharpTargetCapabilityContributions,
} from "./provider-packages/index.js";
import type {
  CsharpProviderOperationsContribution,
} from "./provider-packages/index.js";

export interface CsharpDotnetProviderHost {
  readonly provider: DotnetReflectionTypeDataProvider;
  readonly moduleSpecifierPolicy: DotnetModuleSpecifierPolicy;
  readonly references: readonly string[];
  readonly targetFramework: string | undefined;
}

export interface CsharpExtensionSemanticHosts {
  readonly typescriptCompatibilityMode: TargetTypescriptCompatibilityMode;
  readonly dotnetReflectionReferences: readonly string[];
  readonly dotnetTargetFramework: string | undefined;
  readonly dotnetProviders: readonly CsharpDotnetProviderHost[];
  readonly providerOperationContributions: readonly CsharpProviderOperationsContribution[];
  readonly targetTypeResolutionHost: CsharpTargetTypeResolutionHost;
  readonly objectShapeSemanticsHost: CsharpObjectShapeSemanticsHost;
  readonly objectShapeLifecycleHost: CsharpObjectShapeLifecycleHost;
  readonly runtimeCarrierHost: CsharpRuntimeCarrierSemanticsHost;
  readonly operationsProviderHost: CsharpOperationsProviderHost & CsharpTargetTypeResolutionHost & {
    readonly getTargetTypeRefForType: (
      type: Type | undefined,
      context: ExtensionObservationContext,
      options?: TargetTypeRefResolutionOptions,
    ) => TargetTypeRef | undefined;
  };
}

const csharpExtensionSemanticHostsByTarget = new WeakMap<TargetProviderContext["target"], CsharpExtensionSemanticHosts>();

export function getCsharpExtensionSemanticHosts(context: TargetProviderContext): CsharpExtensionSemanticHosts {
  const existing = csharpExtensionSemanticHostsByTarget.get(context.target);
  if (existing !== undefined) {
    return existing;
  }
  const created = createCsharpExtensionSemanticHosts(context);
  csharpExtensionSemanticHostsByTarget.set(context.target, created);
  return created;
}

export function createCsharpExtensionSemanticHosts(context: TargetProviderContext): CsharpExtensionSemanticHosts {
  const typescriptCompatibilityMode = readCsharpTypescriptCompatibilityMode(context.target);
  const dotnetReflectionReferences = readCsharpReflectionReferencePaths(context.target);
  const dotnetTargetFramework = readCsharpTargetFramework(context.target);
  const nativeDotnetProvider = createDotnetReflectionTypeDataProvider({
    references: dotnetReflectionReferences,
    targetFramework: dotnetTargetFramework,
  });
  const capabilityContributions = createCsharpTargetCapabilityContributions(context);
  const dotnetProviders: readonly CsharpDotnetProviderHost[] = Object.freeze([
    Object.freeze({
      provider: nativeDotnetProvider,
      moduleSpecifierPolicy: dotnetModuleSpecifierPolicy,
      references: dotnetReflectionReferences,
      targetFramework: dotnetTargetFramework,
    }),
    ...capabilityContributions.dotnetProviders.map((contribution) => Object.freeze({
      provider: createDotnetReflectionTypeDataProvider({
        providerIdentity: contribution.providerIdentity,
        moduleSpecifierPolicy: contribution.moduleSpecifierPolicy,
        referenceDirectory: fileURLToPath(contribution.referenceDirectoryUrl),
        assemblySourcePackages: contribution.assemblySourcePackages,
        targetFramework: contribution.targetFramework,
      }),
      moduleSpecifierPolicy: contribution.moduleSpecifierPolicy,
      references: [],
      targetFramework: contribution.targetFramework,
    })),
  ]);
  const getBindingByTargetId = (targetId: string): TargetBindingFact | undefined => uniqueProviderBinding(
    `target id '${targetId}'`,
    dotnetProviders.map((entry) => entry.provider.findTargetBindingByTargetId(targetId)),
  );
  const getBindingByMetadataName = (metadataName: string): TargetBindingFact | undefined => uniqueProviderBinding(
    `metadata name '${metadataName}'`,
    dotnetProviders.map((entry) => entry.provider.findTargetBindingByMetadataName(metadataName)),
  );
  let objectShapeSemanticsHost: CsharpObjectShapeSemanticsHost;
  const getBaseTargetTypeRef = (type: TargetTypeRef): TargetTypeRef | undefined => {
    if (type.kind !== "target-named") {
      return undefined;
    }
    const sourceBaseType = (type as { readonly csharpBaseType?: TargetTypeRef }).csharpBaseType;
    if (sourceBaseType !== undefined) {
      return sourceBaseType;
    }
    const binding = getBindingByTargetId(type.id);
    return binding === undefined
      ? undefined
      : csharpBaseTargetTypeFromBinding(binding, type.typeArguments ?? []);
  };
  const getAssignableTargetTypeRefs = (type: TargetTypeRef): readonly TargetTypeRef[] => {
    if (type.kind !== "target-named") {
      return [];
    }
    const binding = getBindingByTargetId(type.id);
    return [
      ...optionalTargetTypeRef(getBaseTargetTypeRef(type)),
      ...implementedContractTargetTypes(binding, type.typeArguments ?? []),
    ];
  };
  const targetTypeResolutionHost = {
    getCsharpTargetBindingByTargetId: getBindingByTargetId,
    getCsharpTargetBindingByMetadataName: getBindingByMetadataName,
    getCatchVariableTargetTypeRef: () => typescriptCompatibilityMode === "compat" ? csharpTsValueTargetType() : csharpExceptionTargetType(),
    getBaseTargetTypeRef,
    getAssignableTargetTypeRefs,
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
  const runtimeCarrierHost = {
    getTargetTypeRefForSubject,
    getTargetTypeRefForType,
    getTargetTypeRefForSyntaxNode,
    getCatchVariableTargetTypeRef: targetTypeResolutionHost.getCatchVariableTargetTypeRef,
    getCsharpObjectShapeFactForSubject,
    getRecordedCsharpObjectShapeFactForSubject,
  } satisfies CsharpRuntimeCarrierSemanticsHost;
  const operationsProviderHost = {
    getCsharpTargetBindingByTargetId: targetTypeResolutionHost.getCsharpTargetBindingByTargetId,
    getCsharpTargetBindingByMetadataName: targetTypeResolutionHost.getCsharpTargetBindingByMetadataName,
    getBaseTargetTypeRef: targetTypeResolutionHost.getBaseTargetTypeRef,
    getAssignableTargetTypeRefs: targetTypeResolutionHost.getAssignableTargetTypeRefs,
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
    dotnetProviders,
    providerOperationContributions: capabilityContributions.providerOperations,
    targetTypeResolutionHost,
    objectShapeSemanticsHost,
    objectShapeLifecycleHost,
    runtimeCarrierHost,
    operationsProviderHost,
  };
}

function uniqueProviderBinding(
  description: string,
  candidates: readonly (TargetBindingFact | undefined)[],
): TargetBindingFact | undefined {
  const bindings = candidates.filter((candidate): candidate is TargetBindingFact => candidate !== undefined);
  if (bindings.length <= 1) {
    return bindings[0];
  }
  throw new Error(`C# .NET provider target binding conflict for ${description}.`);
}

function optionalTargetTypeRef(type: TargetTypeRef | undefined): readonly TargetTypeRef[] {
  return type === undefined ? [] : [type];
}

function implementedContractTargetTypes(
  binding: TargetBindingFact | undefined,
  typeArguments: readonly TargetTypeRef[],
): readonly TargetTypeRef[] {
  if (binding === undefined) {
    return [];
  }
  const substitutions = targetTypeParameterSubstitutions(binding, typeArguments);
  return ((binding as { readonly implementedContracts?: readonly TargetConstraint[] }).implementedContracts ?? [])
    .flatMap((constraint) => constraint.kind === "implements"
      ? [implementedConstraintTargetType(constraint, substitutions)]
      : []);
}

function implementedConstraintTargetType(
  constraint: Extract<TargetConstraint, { readonly kind: "implements" }>,
  substitutions: ReadonlyMap<string, TargetTypeRef>,
): TargetTypeRef {
  return {
    kind: "target-named",
    id: constraint.contract,
    ...(constraint.typeArguments !== undefined && constraint.typeArguments.length > 0
      ? { typeArguments: constraint.typeArguments.map((argument) => substituteTargetTypeRef(argument, substitutions)) }
      : {}),
  };
}

function targetTypeParameterSubstitutions(
  binding: TargetBindingFact,
  typeArguments: readonly TargetTypeRef[],
): ReadonlyMap<string, TargetTypeRef> {
  return new Map((binding.typeParameters ?? [])
    .map((parameter, index) => {
      const argument = typeArguments[index];
      return argument === undefined ? undefined : [parameter.name, argument] as const;
    })
    .filter((entry): entry is readonly [string, TargetTypeRef] => entry !== undefined));
}
