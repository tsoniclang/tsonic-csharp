import type {
  ExtensionObservationContext,
  Node,
  SourceFile,
  Symbol,
  TargetTypeRef,
  Type,
} from "@tsonic/tsts";
import {
  csharpNullableTargetType,
  csharpDelegateTargetType,
  csharpTaskTargetType,
  csharpVoidTargetType,
} from "./target-types.js";
import {
  getCsharpRecordDictionaryTargetType,
} from "./dictionaries.js";
import {
  isVoidTargetType,
} from "./target-rules.js";
import type {
  TargetTypeRefResolutionOptions,
} from "./target-member-selection.js";
import {
  classifySourceStandardLibraryType,
  isSourceStandardLibraryPromiseType,
  isSourceStandardLibraryRecordType,
} from "./source-type-classification.js";
import type {
  CsharpTargetTypeResolutionHost,
} from "./target-type-resolution.js";
import type {
  CsharpRecursiveTargetTypeResolver,
} from "./target-type-syntax-resolution.js";

export function getSourceArrayTargetTypeRef(
  type: Type,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpTargetTypeResolutionHost,
  resolver: CsharpRecursiveTargetTypeResolver,
): TargetTypeRef | undefined {
  const types = context.compiler?.types;
  const shapeOptions = typeShapeOptions(options);
  if (types === undefined || types.isTuple(type) || !types.isArrayLike(type, shapeOptions)) {
    return undefined;
  }
  const sourceArrayType = classifySourceStandardLibraryType(type, context)?.kind === "array";
  const typeArguments = getTypeArgumentsForArrayShape(type, context, options);
  if (!sourceArrayType && typeArguments.length === 0) {
    return undefined;
  }
  const element = resolver.resolveType(typeArguments[0], context, options, host);
  return element === undefined
    ? undefined
    : { kind: "array", element };
}

function getTypeArgumentsForArrayShape(
  type: Type,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
): readonly Type[] {
  const types = context.compiler?.types;
  if (types === undefined) {
    return [];
  }
  const direct = types.getTypeArguments(type, typeShapeOptions(options)).filter((candidate): candidate is Type => candidate !== undefined);
  if (direct.length > 0) {
    return direct;
  }
  const target = types.getTypeReferenceTarget(type);
  return target === undefined
    ? []
    : types.getTypeArguments(target, typeShapeOptions(options)).filter((candidate): candidate is Type => candidate !== undefined);
}

export function getSourcePromiseTargetTypeRef(
  type: Type,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpTargetTypeResolutionHost,
  resolver: CsharpRecursiveTargetTypeResolver,
): TargetTypeRef | undefined {
  if (!isSourceStandardLibraryPromiseType(type, context)) {
    return undefined;
  }
  const result = resolver.resolveType(getFirstTypeArgument(type, context, options), context, options, host);
  if (result === undefined) {
    return undefined;
  }
  return csharpTaskTargetType(isVoidTargetType(result) ? csharpVoidTargetType() : result);
}

export function getSourceRecordTargetTypeRef(
  type: Type,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpTargetTypeResolutionHost,
  resolver: CsharpRecursiveTargetTypeResolver,
): TargetTypeRef | undefined {
  if (!isSourceStandardLibraryRecordType(type, context)) {
    return undefined;
  }
  const types = context.compiler?.types;
  if (types === undefined || !types.isTypeReference(type)) {
    return undefined;
  }
  const typeArguments = types.getTypeArguments(type, typeShapeOptions(options));
  if (typeArguments.length !== 2) {
    return undefined;
  }
  const keyType = resolver.resolveType(typeArguments[0], context, options, host);
  const valueType = resolver.resolveType(typeArguments[1], context, options, host);
  return keyType === undefined || valueType === undefined
    ? undefined
    : getCsharpRecordDictionaryTargetType(keyType, valueType, host);
}

export function getCallableTargetTypeRefForSemanticType(
  type: Type,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpTargetTypeResolutionHost,
  resolver: CsharpRecursiveTargetTypeResolver,
): TargetTypeRef | undefined {
  const checker = context.compiler?.checker;
  const types = context.compiler?.types;
  if (checker === undefined || types === undefined) {
    return undefined;
  }
  const signatures = types.getCallSignatures(type);
  if (signatures.length !== 1) {
    return undefined;
  }
  const signature = signatures[0]!;
  const parameters = (signature as { readonly parameters?: readonly Symbol[] }).parameters ?? [];
  const parameterTypes = parameters.map((parameter) => resolver.resolveType(checker.getTypeOfSymbol(parameter), context, options, host));
  if (parameterTypes.some((parameter) => parameter === undefined)) {
    return undefined;
  }
  const returnType = resolver.resolveType(types.getReturnTypeOfSignature(signature), context, options, host);
  if (returnType === undefined) {
    return undefined;
  }
  if (isVoidTargetType(returnType)) {
    return csharpDelegateTargetType("System.Action", parameterTypes as readonly TargetTypeRef[]);
  }
  return csharpDelegateTargetType("System.Func", parameterTypes as readonly TargetTypeRef[], returnType);
}

export function getNullableUnionTargetTypeRef(
  type: Type,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpTargetTypeResolutionHost,
  resolver: CsharpRecursiveTargetTypeResolver,
): TargetTypeRef | undefined {
  const types = context.compiler?.types;
  if (types === undefined) {
    return undefined;
  }
  const unionTypes = types.getUnionOrIntersectionTypes(type);
  const nonNullish = unionTypes.filter((candidate) => !types.isNullish(candidate));
  if (nonNullish.length !== 1 || nonNullish.length === unionTypes.length) {
    return undefined;
  }
  const inner = resolver.resolveType(nonNullish[0], context, options, host);
  return inner === undefined
    ? undefined
    : csharpNullableTargetType(inner);
}

export function getTupleTargetTypeRef(
  type: Type,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpTargetTypeResolutionHost,
  resolver: CsharpRecursiveTargetTypeResolver,
): TargetTypeRef | undefined {
  const types = context.compiler?.types;
  if (types === undefined || !types.isTuple(type)) {
    return undefined;
  }
  const elements = types.getTupleElementTypes(type, typeShapeOptions(options))
    .map((element) => resolver.resolveType(element, context, options, host));
  return elements.some((element) => element === undefined)
    ? undefined
    : { kind: "tuple", elements: elements as readonly TargetTypeRef[] };
}

export function getFirstTypeArgument(
  type: Type,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions = {},
): Type | undefined {
  const types = context.compiler?.types;
  if (types === undefined) {
    return undefined;
  }
  const typeArgument = types.isTypeReference(type)
    ? types.getTypeArguments(type, typeShapeOptions(options))[0]
    : undefined;
  if (typeArgument !== undefined) {
    return typeArgument;
  }
  return undefined;
}

export function resolveTargetTypeArgumentsForTypeWithResolver(
  type: Type,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpTargetTypeResolutionHost,
  resolver: CsharpRecursiveTargetTypeResolver,
): readonly TargetTypeRef[] | undefined {
  const types = context.compiler?.types;
  if (types === undefined || !types.isTypeReference(type)) {
    return [];
  }
  const resolved = types.getTypeArguments(type, typeShapeOptions(options))
    .map((argument) => resolver.resolveType(argument, context, options, host));
  return resolved.some((argument) => argument === undefined)
    ? undefined
    : resolved as readonly TargetTypeRef[];
}

export function typeShapeOptions(options: TargetTypeRefResolutionOptions): { readonly sourceFile: SourceFile } | undefined {
  return options.sourceFile === undefined ? undefined : { sourceFile: options.sourceFile };
}

export function getTypeParameterName(type: Type, context: ExtensionObservationContext): string | undefined {
  const ast = context.compiler?.ast;
  const declarations = (type.symbol as { readonly Declarations?: readonly Node[] } | undefined)?.Declarations ?? [];
  if (ast === undefined) {
    return undefined;
  }
  for (const declaration of declarations) {
    if (ast.is.IsTypeParameterDeclaration(declaration)) {
      const name = ast.text(ast.name(declaration));
      return name.length === 0 ? undefined : name;
    }
  }
  return undefined;
}
