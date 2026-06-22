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
} from "./target-types.js";
import {
  getSourceArrayTargetTypeRef,
  getSourcePromiseTargetTypeRef,
} from "./target-type-semantic-resolution.js";
import {
  getCsharpTargetTypeFromBinding,
} from "./target-enrichment.js";
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
  const typeNameSymbol = checker.getSymbolAtLocation(typeName, { sourceFile });
  const type = asType(checker.getTypeFromTypeNode(node));
  const candidateSubjects: readonly (ExtensionFactSubject | undefined)[] = [
    node,
    typeName,
    typeNameSymbol,
    getAliasedSymbolIfAvailable(checker, typeNameSymbol, sourceFile),
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
  const binding = resolveTargetBindingFact(context, node) ??
    resolveTargetBindingFact(context, typeName) ??
    resolveTargetBindingFact(context, type) ??
    resolveTargetBindingFact(context, type?.symbol);
  if (binding !== undefined) {
    const typeArguments = ast.typeArguments(node).map((argument) => resolver.resolveSubject(argument, context, options, host));
    if (typeArguments.some((argument) => argument === undefined)) {
      return undefined;
    }
    return getCsharpTargetTypeFromBinding(binding, typeArguments as readonly TargetTypeRef[], host);
  }
  const sourceLibraryType = type === undefined
    ? undefined
    : getSourceArrayTargetTypeRef(type, context, options, host, resolver) ??
      getSourcePromiseTargetTypeRef(type, context, options, host, resolver);
  if (sourceLibraryType !== undefined) {
    return sourceLibraryType;
  }
  const sourceDeclarationType = getTargetTypeRefFromSourceDeclarationReference(candidateSubjects, node, context, options, host, resolver);
  if (sourceDeclarationType !== undefined) {
    return sourceDeclarationType;
  }
  const aliasedType = getTargetTypeRefFromTypeAliasDeclarations(candidateSubjects, node, context, options, host, resolver);
  if (aliasedType !== undefined) {
    return aliasedType;
  }
  return undefined;
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
    for (const declaration of getSymbolDeclarations(subject)) {
      const kind = ast.kindName(declaration);
      if (kind !== "KindClassDeclaration" && kind !== "KindInterfaceDeclaration" && kind !== "KindEnumDeclaration") {
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
    const declarations = getSymbolDeclarations(subject);
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
