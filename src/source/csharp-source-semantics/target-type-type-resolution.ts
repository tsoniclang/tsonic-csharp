import {
  sourcePrimitiveFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionObservationContext,
  TargetTypeRef,
  Type,
} from "@tsonic/tsts";
import {
  resolveTargetBinding,
} from "./provider-bindings.js";
import {
  csharpSourcePrimitiveTargetType,
  csharpTargetNamedType,
  csharpTargetTypeFromBinding,
} from "./target-types.js";
import type {
  TargetTypeRefResolutionOptions,
} from "./target-member-selection.js";
import {
  getCallableTargetTypeRefForSemanticType,
  getNullableUnionTargetTypeRef,
  getSourceArrayTargetTypeRef,
  getSourcePromiseTargetTypeRef,
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
  resolveRuntimeCarrier,
} from "./target-type-resolution-facts.js";

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
  if (options.allowRuntimeCarrier !== false) {
    const direct = resolveRuntimeCarrier(type, context) ??
      resolveRuntimeCarrier(type.symbol, context);
    if (direct !== undefined) {
      return direct;
    }
  }
  const primitive = context.factResolver.resolve(type, sourcePrimitiveFactKey) ??
    (type.symbol === undefined ? undefined : context.factResolver.resolve(type.symbol, sourcePrimitiveFactKey));
  if (primitive !== undefined) {
    return csharpSourcePrimitiveTargetType(primitive.kind);
  }
  const types = context.compiler?.types;
  if (types === undefined) {
    return undefined;
  }
  const sourceArray = getSourceArrayTargetTypeRef(type, context, options, host, recursiveTargetTypeResolver);
  if (sourceArray !== undefined) {
    return sourceArray;
  }
  const sourcePromise = getSourcePromiseTargetTypeRef(type, context, options, host, recursiveTargetTypeResolver);
  if (sourcePromise !== undefined) {
    return sourcePromise;
  }
  const binding = resolveTargetBinding(type.symbol, context);
  if (binding !== undefined) {
    const targetTypeArguments = resolveTargetTypeArgumentsForType(type, context, options, host);
    if (targetTypeArguments === undefined || !targetTypeArgumentArityMatches(binding.typeParameters?.length ?? 0, targetTypeArguments.length)) {
      return undefined;
    }
    return csharpTargetTypeFromBinding(binding, targetTypeArguments);
  }
  const providerVirtualTarget = getProviderVirtualDeclarationTargetTypeRef(type.symbol, context) ??
    getProviderVirtualDeclarationTargetTypeRefFromDeclarations(type, context);
  if (providerVirtualTarget !== undefined) {
    const targetTypeArguments = resolveTargetTypeArgumentsForType(type, context, options, host);
    if (targetTypeArguments === undefined) {
      return undefined;
    }
    return {
      ...providerVirtualTarget,
      ...(targetTypeArguments.length > 0 ? { typeArguments: targetTypeArguments } : {}),
    };
  }
  const typeParameterName = getTypeParameterName(type, context);
  if (typeParameterName !== undefined) {
    return { kind: "type-parameter", name: typeParameterName };
  }
  if (types.isUnion(type)) {
    const nullable = getNullableUnionTargetTypeRef(type, context, options, host, recursiveTargetTypeResolver);
    if (nullable !== undefined) {
      return nullable;
    }
    return undefined;
  }
  const declaredShape = host.getSemanticTypeDeclarationShape(type, context);
  if (declaredShape !== undefined) {
    return declaredShape.targetType;
  }
  if (types.isBooleanLike(type)) {
    return csharpSourcePrimitiveTargetType("bool");
  }
  if (types.isNumberLike(type)) {
    return csharpSourcePrimitiveTargetType("float64");
  }
  if (types.isStringLike(type)) {
    return csharpTargetNamedType("System.String");
  }
  if (types.isBigIntLike(type)) {
    return csharpTargetNamedType("System.Numerics.BigInteger");
  }
  const callable = getCallableTargetTypeRefForSemanticType(type, context, options, host, recursiveTargetTypeResolver);
  if (callable !== undefined) {
    return callable;
  }
  const tuple = getTupleTargetTypeRef(type, context, options, host, recursiveTargetTypeResolver);
  if (tuple !== undefined) {
    return tuple;
  }
  return undefined;
}

function targetTypeArgumentArityMatches(typeParameterCount: number, typeArgumentCount: number): boolean {
  return typeParameterCount === typeArgumentCount;
}
