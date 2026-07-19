import type {
  ExtensionObservationContext,
  TargetTypeRef,
  Type,
} from "@tsonic/tsts";
import {
  resolveTargetBinding,
} from "./provider-bindings.js";
import {
  csharpBigIntegerTargetType,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpVoidTargetType,
} from "./target-types.js";
import {
  enrichCsharpTargetTypeRef,
  getCsharpTargetTypeFromBinding,
} from "./target-enrichment.js";
import type {
  TargetTypeRefResolutionOptions,
} from "./target-member-selection.js";
import {
  getCallableTargetTypeRefForSemanticType,
  getNullableUnionTargetTypeRef,
  getSourceArrayTargetTypeRef,
  getSourcePromiseTargetTypeRef,
  getSourceRecordTargetTypeRef,
  getTupleTargetTypeRef,
  getTypeParameterName,
} from "./target-type-semantic-resolution.js";
import type {
  CsharpRecursiveTargetTypeResolver,
} from "./target-type-syntax-resolution.js";
import type {
  CsharpTargetTypeResolutionHost,
} from "./target-type-resolution-host.js";
import {
  getProviderVirtualDeclarationTargetTypeRef,
  getProviderVirtualDeclarationTargetTypeRefFromDeclarations,
  resolveCsharpRuntimeCarrier,
} from "./target-type-resolution-facts.js";
import {
  targetTypeRefContainsSourcePrimitive,
} from "./target-ref-utils.js";

export type CsharpTargetTypeArgumentsResolver = (
  type: Type,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpTargetTypeResolutionHost,
) => readonly TargetTypeRef[] | undefined;

export function resolveTargetTypeRefForTypeCore(
  type: Type | undefined,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpTargetTypeResolutionHost,
  recursiveTargetTypeResolver: CsharpRecursiveTargetTypeResolver,
  resolveTargetTypeArgumentsForType: CsharpTargetTypeArgumentsResolver,
): TargetTypeRef | undefined {
  if (type === undefined) {
    return undefined;
  }
  const types = context.compiler?.typeShape;
  if (types === undefined) {
    return resolveNonPrimitiveRuntimeCarrier(type, context, options, host, resolveTargetTypeArgumentsForType);
  }
  const typeSymbol = context.compiler?.checker.getTypeSymbol(type);
  const sourceArray = getSourceArrayTargetTypeRef(type, context, options, host, recursiveTargetTypeResolver);
  if (sourceArray !== undefined) {
    return sourceArray;
  }
  const sourcePromise = getSourcePromiseTargetTypeRef(type, context, options, host, recursiveTargetTypeResolver);
  if (sourcePromise !== undefined) {
    return sourcePromise;
  }
  const sourceRecord = getSourceRecordTargetTypeRef(type, context, options, host, recursiveTargetTypeResolver);
  if (sourceRecord !== undefined) {
    return sourceRecord;
  }
  const typeParameterName = getTypeParameterName(type, context);
  if (typeParameterName !== undefined) {
    return { kind: "type-parameter", name: typeParameterName };
  }
  const binding = resolveTargetBinding(typeSymbol, context);
  if (binding !== undefined) {
    const targetTypeArguments = resolveTargetTypeArgumentsForType(type, context, options, host);
    if (targetTypeArguments === undefined || !targetTypeArgumentArityMatches(binding.typeParameters?.length ?? 0, targetTypeArguments.length)) {
      return undefined;
    }
    return getCsharpTargetTypeFromBinding(binding, targetTypeArguments, host);
  }
  const providerVirtualTarget = getProviderVirtualDeclarationTargetTypeRef(typeSymbol, context) ??
    getProviderVirtualDeclarationTargetTypeRefFromDeclarations(type, context);
  if (providerVirtualTarget !== undefined) {
    const targetTypeArguments = resolveTargetTypeArgumentsForType(type, context, options, host);
    if (targetTypeArguments === undefined) {
      return undefined;
    }
    return enrichCsharpTargetTypeRef({
      ...providerVirtualTarget,
      ...(targetTypeArguments.length > 0 ? { typeArguments: targetTypeArguments } : {}),
    }, host);
  }
  const runtimeCarrier = resolveNonPrimitiveRuntimeCarrier(type, context, options, host, resolveTargetTypeArgumentsForType);
  if (runtimeCarrier !== undefined) {
    return runtimeCarrier;
  }
  const callable = getCallableTargetTypeRefForSemanticType(type, context, options, host, recursiveTargetTypeResolver);
  if (callable !== undefined) {
    return callable;
  }
  if (types.isBooleanLike(type)) {
    return csharpSourcePrimitiveTargetType("bool");
  }
  if (types.isNumberLike(type)) {
    return csharpSourcePrimitiveTargetType("float64");
  }
  if (types.isStringLike(type)) {
    return csharpStringTargetType();
  }
  if (types.isBigIntLike(type)) {
    return csharpBigIntegerTargetType();
  }
  if (types.isVoidLike(type)) {
    return csharpVoidTargetType();
  }
  if (types.isUnion(type)) {
    const nullable = getNullableUnionTargetTypeRef(type, context, options, host, recursiveTargetTypeResolver);
    if (nullable !== undefined) {
      return nullable;
    }
    return getHomogeneousPrimitiveUnionTargetTypeRef(type, context);
  }
  const declaredShape = host.getSemanticTypeDeclarationShape(type, context, recursiveTargetTypeResolver);
  if (declaredShape !== undefined) {
    return declaredShape.targetType;
  }
  const objectShape = host.getCsharpObjectShapeFactForSubject(type, context, recursiveTargetTypeResolver);
  if (objectShape !== undefined) {
    return objectShape.targetType;
  }
  const tuple = getTupleTargetTypeRef(type, context, options, host, recursiveTargetTypeResolver);
  if (tuple !== undefined) {
    return tuple;
  }
  return undefined;
}

function getHomogeneousPrimitiveUnionTargetTypeRef(
  type: Type,
  context: ExtensionObservationContext,
): TargetTypeRef | undefined {
  const types = context.compiler?.typeShape;
  if (types === undefined || !types.isUnion(type)) {
    return undefined;
  }
  const members = types.getUnionOrIntersectionTypes(type)
    .filter((member): member is Type => member !== undefined && !types.isNullish(member));
  if (members.length === 0) {
    return undefined;
  }
  if (members.every((member) => types.isStringLike(member))) {
    return csharpStringTargetType();
  }
  if (members.every((member) => types.isBooleanLike(member))) {
    return csharpSourcePrimitiveTargetType("bool");
  }
  if (members.every((member) => types.isNumberLike(member))) {
    return csharpSourcePrimitiveTargetType("float64");
  }
  if (members.every((member) => types.isBigIntLike(member))) {
    return csharpBigIntegerTargetType();
  }
  return undefined;
}

function resolveNonPrimitiveRuntimeCarrier(
  type: Type,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpTargetTypeResolutionHost,
  resolveTargetTypeArgumentsForType: CsharpTargetTypeArgumentsResolver,
): TargetTypeRef | undefined {
  if (options.allowRuntimeCarrier === false) {
    return undefined;
  }
  const direct = resolveCsharpRuntimeCarrier(type, context);
  if (direct !== undefined && !targetTypeRefContainsSourcePrimitive(direct)) {
    return direct;
  }
  const typeSymbol = context.compiler?.checker.getTypeSymbol(type);
  const symbolCarrier = resolveCsharpRuntimeCarrier(typeSymbol, context);
  if (symbolCarrier === undefined || targetTypeRefContainsSourcePrimitive(symbolCarrier)) {
    return undefined;
  }
  const instantiated = instantiateSemanticRuntimeCarrier(symbolCarrier, type, context, options, host, resolveTargetTypeArgumentsForType);
  return instantiated === undefined || targetTypeRefContainsSourcePrimitive(instantiated)
    ? undefined
    : instantiated;
}

function instantiateSemanticRuntimeCarrier(
  carrier: TargetTypeRef,
  type: Type,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpTargetTypeResolutionHost,
  resolveTargetTypeArgumentsForType: CsharpTargetTypeArgumentsResolver,
): TargetTypeRef | undefined {
  if (carrier.kind !== "target-named") {
    return carrier;
  }
  const typeArguments = resolveTargetTypeArgumentsForType(type, context, options, host);
  if (typeArguments === undefined) {
    return undefined;
  }
  return typeArguments.length === 0
    ? carrier
    : {
        ...carrier,
        typeArguments,
      };
}

function targetTypeArgumentArityMatches(typeParameterCount: number, typeArgumentCount: number): boolean {
  return typeParameterCount === typeArgumentCount;
}
