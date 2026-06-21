import {
  sourcePrimitiveFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  Node,
  TargetTypeRef,
  Type,
} from "@tsonic/tsts";
import {
  asNodeSubject,
  isTypeSyntaxNode,
} from "./ast-utils.js";
import {
  resolveTargetBinding,
} from "./provider-bindings.js";
import {
  csharpSourcePrimitiveTargetType,
  csharpTargetNamedType,
} from "./target-types.js";
import type {
  TargetTypeRefResolutionOptions,
} from "./target-member-selection.js";
import {
  asTargetTypeRef,
  asType,
} from "./target-ref-utils.js";
import {
  getTargetTypeRefFromCheckedExpressionSyntax,
  getTargetTypeRefFromSyntax,
  resolveFunctionTargetTypeRefFromSignatureLikeSubject as resolveFunctionTargetTypeRefFromSignatureLikeSubjectWithResolver,
} from "./target-type-syntax-resolution.js";
import type {
  CsharpRecursiveTargetTypeResolver,
} from "./target-type-syntax-resolution.js";
import {
  getCallableTargetTypeRefForSemanticType,
  getNullableUnionTargetTypeRef,
  getSourceArrayTargetTypeRef,
  getSourcePromiseTargetTypeRef,
  getTupleTargetTypeRef,
  getTypeParameterName,
  resolveTargetTypeArgumentsForTypeWithResolver,
} from "./target-type-semantic-resolution.js";
import type {
  CsharpTargetTypeResolutionHost,
} from "./target-type-resolution-host.js";
import {
  getCatchVariableTargetTypeRef,
  getProviderVirtualDeclarationTargetTypeRef,
  getProviderVirtualDeclarationTargetTypeRefFromDeclarations,
  getTargetTypeRefFromDeclarationAnnotation,
  resolveRuntimeCarrier,
} from "./target-type-resolution-facts.js";
import {
  resolveTargetTypeRefFromSubjectFacts,
} from "./target-type-subject-facts.js";

export type {
  CsharpSemanticTypeDeclarationShape,
  CsharpTargetTypeResolutionHost,
} from "./target-type-resolution-host.js";

const recursiveTargetTypeResolver: CsharpRecursiveTargetTypeResolver = {
  resolveSubject: resolveTargetTypeRefForSubject,
  resolveType: resolveTargetTypeRefForType,
};

export function resolveTargetTypeRefForSubject(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpTargetTypeResolutionHost,
): TargetTypeRef | undefined {
  if (subject === undefined) {
    return undefined;
  }
  const targetRef = asTargetTypeRef(subject);
  if (targetRef !== undefined) {
    return targetRef;
  }
  const subjectType = asType(subject);
  if (subjectType !== undefined) {
    return resolveTargetTypeRefForType(subjectType, context, options, host);
  }
  const directFact = resolveTargetTypeRefFromSubjectFacts(
    subject,
    context,
    options,
    (factSubject, factContext, factOptions) => resolveTargetTypeRefForSubject(factSubject, factContext, factOptions, host),
  );
  if (directFact !== undefined) {
    return directFact;
  }
  const expressionResult = getTargetTypeRefFromCheckedExpressionSyntax(subject, context, options, host, recursiveTargetTypeResolver);
  if (expressionResult !== undefined) {
    return expressionResult;
  }
  const catchVariableType = getCatchVariableTargetTypeRef(subject, context);
  if (catchVariableType !== undefined) {
    return catchVariableType;
  }
  const binding = resolveTargetBinding(subject, context);
  if (binding !== undefined) {
    return { kind: "target-named", id: binding.id };
  }
  const providerVirtualTarget = getProviderVirtualDeclarationTargetTypeRef(subject, context);
  if (providerVirtualTarget !== undefined) {
    return providerVirtualTarget;
  }
  const syntaxType = getTargetTypeRefFromSyntax(subject, context, options, host, recursiveTargetTypeResolver);
  if (syntaxType !== undefined) {
    return syntaxType;
  }
  const declarationType = getTargetTypeRefFromDeclarationAnnotation(subject, context, options, host, resolveTargetTypeRefForSubject);
  if (declarationType !== undefined) {
    return declarationType;
  }
  const node = asNodeSubject(subject);
  const checker = context.compiler?.checker;
  const ast = context.compiler?.ast;
  const type = node === undefined || checker === undefined || options.allowSemanticTypeQuery === false
    ? undefined
    : ast !== undefined && isTypeSyntaxNode(ast, node)
      ? asType(checker.getTypeFromTypeNode(node))
      : asType(checker.getTypeAtLocation(node));
  return resolveTargetTypeRefForType(type, context, {
    ...options,
    ...(ast !== undefined && node !== undefined ? { sourceFile: ast.getSourceFile(node) } : {}),
  }, host);
}

export function resolveTargetTypeRefForType(
  type: Type | undefined,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpTargetTypeResolutionHost,
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
    return {
      kind: "target-named",
      id: binding.id,
      ...(targetTypeArguments.length > 0 ? { typeArguments: targetTypeArguments } : {}),
    };
  }
  const providerVirtualTarget = getProviderVirtualDeclarationTargetTypeRef(type.symbol, context) ??
    getProviderVirtualDeclarationTargetTypeRefFromDeclarations(type, context);
  if (providerVirtualTarget !== undefined) {
    const targetTypeArguments = resolveTargetTypeArgumentsForType(type, context, options, host);
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

export function resolveFunctionTargetTypeRefFromSignatureLikeSubject(
  node: Node,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpTargetTypeResolutionHost,
): TargetTypeRef | undefined {
  return resolveFunctionTargetTypeRefFromSignatureLikeSubjectWithResolver(
    node,
    context,
    options,
    host,
    recursiveTargetTypeResolver,
  );
}

export function resolveTargetTypeArgumentsForType(
  type: Type,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpTargetTypeResolutionHost,
): readonly TargetTypeRef[] {
  return resolveTargetTypeArgumentsForTypeWithResolver(
    type,
    context,
    options,
    host,
    recursiveTargetTypeResolver,
  );
}
