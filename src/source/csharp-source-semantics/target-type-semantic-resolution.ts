import type {
  ExtensionObservationContext,
  Node,
  SourceFile,
  Symbol,
  TargetTypeRef,
  Type,
} from "@tsonic/tsts";
import {
  csharpTargetNamedType,
} from "./target-types.js";
import {
  isVoidTargetType,
} from "./target-rules.js";
import type {
  TargetTypeRefResolutionOptions,
} from "./target-member-selection.js";
import {
  asType,
} from "./target-ref-utils.js";
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
  if (types === undefined || !types.isArrayLike(type, typeShapeOptions(options))) {
    return undefined;
  }
  const sourceArrayType = isSourceLibraryType(type, context, "Array") ||
    isSourceLibraryType(type, context, "ReadonlyArray");
  if (!sourceArrayType) {
    return undefined;
  }
  const element = resolver.resolveType(getFirstTypeArgument(type, context, options), context, options, host);
  return element === undefined ? undefined : { kind: "array", element };
}

export function getSourcePromiseTargetTypeRef(
  type: Type,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpTargetTypeResolutionHost,
  resolver: CsharpRecursiveTargetTypeResolver,
): TargetTypeRef | undefined {
  if (!isSourceLibraryType(type, context, "Promise")) {
    return undefined;
  }
  const result = resolver.resolveType(getFirstTypeArgument(type, context, options), context, options, host);
  return result === undefined || isVoidTargetType(result)
    ? csharpTargetNamedType("System.Threading.Tasks.Task")
    : csharpTargetNamedType("System.Threading.Tasks.Task`1", [result]);
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
  if (returnType === undefined || isVoidTargetType(returnType)) {
    return csharpTargetNamedType(`System.Action\`${parameterTypes.length}`, parameterTypes as readonly TargetTypeRef[]);
  }
  return csharpTargetNamedType(`System.Func\`${parameterTypes.length + 1}`, [...(parameterTypes as readonly TargetTypeRef[]), returnType]);
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
    : csharpTargetNamedType("System.Nullable`1", [inner]);
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
  return types.getIndexInfos(type)
    .map((info) => (info as { readonly valueType?: unknown }).valueType)
    .find((value): value is Type => asType(value) !== undefined);
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

export function isSourceLibraryType(type: Type, context: ExtensionObservationContext, name: string): boolean {
  const ast = context.compiler?.ast;
  const types = context.compiler?.types;
  if (ast === undefined || types === undefined) {
    return false;
  }
  const target = types.isTypeReference(type) ? types.getTypeReferenceTarget(type) : type;
  const declarations = (target?.symbol as { readonly Declarations?: readonly Node[] } | undefined)?.Declarations ??
    (type.symbol as { readonly Declarations?: readonly Node[] } | undefined)?.Declarations ??
    [];
  return declarations.some((declaration) =>
    ast.text(ast.name(declaration)) === name &&
    ast.getFileName(ast.getSourceFile(declaration)).startsWith("bundled:///libs/"));
}
