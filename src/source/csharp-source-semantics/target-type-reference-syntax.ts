import {
  sourcePrimitiveFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  Node,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  asNodeSubject,
  getNodeField,
} from "./ast-utils.js";
import {
  resolveTargetBindingForReference,
} from "./provider-bindings.js";
import {
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
  const type = asType(checker.getTypeFromTypeNode(node));
  const candidateSubjects: readonly (ExtensionFactSubject | undefined)[] = [
    node,
    typeName,
    type?.symbol,
    checker.getSymbolAtLocation(typeName),
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
  for (const candidate of [type, type?.symbol]) {
    if (candidate === undefined) {
      continue;
    }
    const primitive = context.factResolver.resolve(candidate, sourcePrimitiveFactKey);
    if (primitive !== undefined) {
      return csharpSourcePrimitiveTargetType(primitive.kind);
    }
  }
  const binding = resolveTargetBindingForReference(node, context);
  if (binding !== undefined) {
    const typeArguments = ast.typeArguments(node).map((argument) => resolver.resolveSubject(argument, context, options, host));
    if (typeArguments.some((argument) => argument === undefined)) {
      return undefined;
    }
    return getCsharpTargetTypeFromBinding(binding, typeArguments as readonly TargetTypeRef[], host);
  }
  const aliasedType = getTargetTypeRefFromTypeAliasDeclarations(candidateSubjects, node, context, options, host, resolver);
  if (aliasedType !== undefined) {
    return aliasedType;
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
