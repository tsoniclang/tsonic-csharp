import {
  sourcePrimitiveFactKey,
  targetBindingFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  Node,
  TargetBindingFact,
  TargetTypeRef,
  Type,
} from "@tsonic/tsts";
import {
  asNodeSubject,
  getNodeField,
  getNodeNameText,
} from "./ast-utils.js";
import {
  sourceDeclarationTargetType,
} from "./source-declaration-facts.js";
import {
  getSourceLibraryDeclarationName,
} from "./source-library.js";
import {
  isSourceStandardLibraryPromiseType,
} from "./source-type-classification.js";
import {
  getAliasedSymbolIfAvailable,
  getSymbolDeclarations,
} from "./symbol-utils.js";
import type {
  TargetTypeRefResolutionOptions,
} from "./target-member-selection.js";
import {
  asType,
} from "./target-ref-utils.js";
import {
  csharpSourcePrimitiveTargetType,
  csharpTaskTargetType,
  csharpVoidTargetType,
} from "./target-types.js";
import {
  isVoidTargetType,
} from "./target-rules.js";
import {
  getSourceArrayTargetTypeRef,
  getSourcePromiseTargetTypeRef,
  resolveTargetTypeArgumentsForTypeWithResolver,
} from "./target-type-semantic-resolution.js";
import {
  getCsharpTargetTypeFromBinding,
} from "./target-enrichment.js";
import {
  getCsharpRecordDictionaryTargetType,
} from "./dictionaries.js";
import type {
  CsharpTargetTypeResolutionHost,
} from "./target-type-resolution.js";
import type {
  CsharpRecursiveTargetTypeResolver,
} from "./target-type-syntax-types.js";

export function getTargetTypeRefFromTypeReferenceSyntax(
  node: Node,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpTargetTypeResolutionHost,
  resolver: CsharpRecursiveTargetTypeResolver,
): TargetTypeRef | undefined {
  const ast = context.compiler?.ast;
  const checker = context.compiler?.checker;
  const typeName = asNodeSubject(getNodeField(node, "TypeName"));
  if (ast === undefined || checker === undefined || typeName === undefined) {
    return undefined;
  }
  const sourceFile = ast.getSourceFile(node);
  const symbol = checker.getSymbolAtLocation(typeName, { sourceFile });
  const aliasedSymbol = getAliasedSymbolIfAvailable(checker, symbol, sourceFile);
  const type = asType(checker.getTypeFromTypeNode(node, { sourceFile }));
  const typeAliasSymbol = type === undefined ? undefined : context.compiler?.checker.getTypeAliasSymbol(type);
  const typeSymbol = type === undefined ? undefined : context.compiler?.checker.getTypeSymbol(type);
  const candidateSubjects: readonly (ExtensionFactSubject | undefined)[] = [
    node,
    typeName,
    symbol,
    aliasedSymbol,
    typeAliasSymbol,
    typeSymbol,
  ];
  for (const candidate of candidateSubjects) {
    if (candidate === undefined) {
      continue;
    }
    const primitive = context.factResolver.resolve(candidate, sourcePrimitiveFactKey);
    if (primitive !== undefined) {
      return csharpSourcePrimitiveTargetType(primitive.kind);
    }
  }
  const aliasedType = getTargetTypeRefFromTypeAliasDeclarations(candidateSubjects, node, context, options, host, resolver);
  if (aliasedType !== undefined) {
    return aliasedType;
  }
  const binding = resolveTargetBindingFact(context, node) ??
    resolveTargetBindingFact(context, typeName) ??
    resolveTargetBindingFact(context, type) ??
    resolveTargetBindingFact(context, typeSymbol);
  if (binding !== undefined) {
    const typeArguments = resolveTargetTypeArgumentsForReferenceSyntax(node, type, context, options, host, resolver);
    if (typeArguments === undefined) {
      return undefined;
    }
    return getCsharpTargetTypeFromBinding(binding, typeArguments, host);
  }
  const recordDictionaryType = getRecordDictionaryTypeRefFromTypeReference(
    candidateSubjects,
    node,
    context,
    options,
    host,
    resolver,
  );
  if (recordDictionaryType !== undefined) {
    return recordDictionaryType;
  }
  const sourceLibraryType = type === undefined
    ? undefined
    : getSourceArrayTargetTypeRef(type, context, options, host, resolver) ??
      getSourcePromiseTargetTypeRefFromSyntax(node, type, context, options, host, resolver) ??
      getSourcePromiseTargetTypeRef(type, context, options, host, resolver);
  if (sourceLibraryType !== undefined) {
    return sourceLibraryType;
  }
  const sourceDeclarationType = getTargetTypeRefFromSourceDeclarationReference(candidateSubjects, node, context, options, host, resolver);
  if (sourceDeclarationType !== undefined) {
    return sourceDeclarationType;
  }
  return undefined;
}

function resolveTargetTypeArgumentsForReferenceSyntax(
  node: Node,
  semanticType: Type | undefined,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpTargetTypeResolutionHost,
  resolver: CsharpRecursiveTargetTypeResolver,
): readonly TargetTypeRef[] | undefined {
  const ast = context.compiler?.ast;
  if (ast === undefined) {
    return undefined;
  }
  const syntaxArguments = ast.typeArguments(node);
  if (syntaxArguments.length > 0) {
    const resolved = syntaxArguments.map((argument) => resolver.resolveSubject(argument, context, options, host));
    return resolved.some((argument) => argument === undefined)
      ? undefined
      : resolved as readonly TargetTypeRef[];
  }
  return semanticType === undefined
    ? []
    : resolveTargetTypeArgumentsForTypeWithResolver(semanticType, context, options, host, resolver);
}

function getRecordDictionaryTypeRefFromTypeReference(
  subjects: readonly (ExtensionFactSubject | undefined)[],
  currentNode: Node,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpTargetTypeResolutionHost,
  resolver: CsharpRecursiveTargetTypeResolver,
): TargetTypeRef | undefined {
  const ast = context.compiler?.ast;
  if (ast === undefined || !subjects.some((subject) => isRecordDeclarationSubject(subject, context))) {
    return undefined;
  }
  const typeArguments = ast.typeArguments(currentNode).map((argument) => resolver.resolveSubject(argument, context, options, host));
  if (typeArguments.length !== 2 || typeArguments.some((argument) => argument === undefined)) {
    return undefined;
  }
  return getCsharpRecordDictionaryTargetType(typeArguments[0]!, typeArguments[1]!, host);
}

function isRecordDeclarationSubject(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): boolean {
  return getSymbolDeclarations(subject, context.compiler?.checker).some((declaration) =>
    getSourceLibraryDeclarationName(declaration, context) === "Record");
}

function getSourcePromiseTargetTypeRefFromSyntax(
  node: Node,
  type: Type | undefined,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpTargetTypeResolutionHost,
  resolver: CsharpRecursiveTargetTypeResolver,
): TargetTypeRef | undefined {
  const ast = context.compiler?.ast;
  if (ast === undefined || type === undefined || !isSourceStandardLibraryPromiseType(type, context)) {
    return undefined;
  }
  const resultTypeNode = ast.typeArguments(node)[0];
  const result = resolver.resolveSubject(resultTypeNode, context, options, host);
  if (result === undefined) {
    return undefined;
  }
  return csharpTaskTargetType(isVoidTargetType(result) ? csharpVoidTargetType() : result);
}

function resolveTargetBindingFact(
  context: ExtensionObservationContext,
  subject: ExtensionFactSubject | undefined,
): TargetBindingFact | undefined {
  return subject === undefined ? undefined : context.factResolver.resolve(subject, targetBindingFactKey);
}

function getTargetTypeRefFromSourceDeclarationReference(
  subjects: readonly (ExtensionFactSubject | undefined)[],
  currentNode: Node,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpTargetTypeResolutionHost,
  resolver: CsharpRecursiveTargetTypeResolver,
): TargetTypeRef | undefined {
  const ast = context.compiler?.ast;
  if (ast === undefined) {
    return undefined;
  }
  const typeArguments = ast.typeArguments(currentNode).map((argument) => resolver.resolveSubject(argument, context, options, host));
  if (typeArguments.some((argument) => argument === undefined)) {
    return undefined;
  }
  for (const subject of subjects) {
    for (const declaration of getSymbolDeclarations(subject, context.compiler?.checker)) {
      const kind = ast.kindName(declaration);
      if (kind !== "KindClassDeclaration" && kind !== "KindInterfaceDeclaration" && kind !== "KindEnumDeclaration") {
        continue;
      }
      if (getSourceLibraryDeclarationName(declaration, context) !== undefined) {
        continue;
      }
      return sourceDeclarationTargetType(
        getNodeNameText(declaration),
        kind,
        typeArguments as readonly TargetTypeRef[],
      );
    }
  }
  return undefined;
}

function getTargetTypeRefFromTypeAliasDeclarations(
  subjects: readonly (ExtensionFactSubject | undefined)[],
  currentNode: Node,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpTargetTypeResolutionHost,
  resolver: CsharpRecursiveTargetTypeResolver,
): TargetTypeRef | undefined {
  for (const subject of subjects) {
    const declarations = getSymbolDeclarations(subject, context.compiler?.checker);
    for (const declaration of declarations) {
      const typeNode = asNodeSubject(getNodeField(declaration, "Type"));
      if (typeNode === undefined || typeNode === currentNode) {
        continue;
      }
      const result = resolver.resolveSubject(typeNode, context, options, host);
      if (result !== undefined) {
        return result;
      }
    }
  }
  return undefined;
}
