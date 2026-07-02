import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  SourceFile,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  asNodeSubject,
  getNodeField,
} from "./ast-utils.js";
import type {
  TargetTypeRefResolutionOptions,
} from "./target-member-selection.js";

export function getReferencedDeclarationTargetTypeRef(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
  resolveTargetTypeRef: (
    subject: ExtensionFactSubject | undefined,
    context: ExtensionObservationContext,
    options?: TargetTypeRefResolutionOptions,
  ) => TargetTypeRef | undefined,
  options: TargetTypeRefResolutionOptions = {},
): TargetTypeRef | undefined {
  const node = asNodeSubject(subject);
  const compiler = context.compiler;
  if (node === undefined || compiler === undefined) {
    return undefined;
  }
  const sourceFile = options.sourceFile ?? compiler.ast.getSourceFile(node);
  if (sourceFile === undefined) {
    return undefined;
  }
  const symbols = [
    compiler.checker.getSymbolAtLocation(node, { sourceFile }),
    safeGetResolvedSymbol(node, sourceFile, context),
  ];
  for (const symbol of symbols) {
    for (const declaration of compiler.checker.getSymbolDeclarations(symbol)) {
      const target = getDeclarationAnnotationTargetTypeRef(declaration, context, resolveTargetTypeRef, {
        ...options,
        sourceFile: compiler.ast.getSourceFile(declaration) ?? sourceFile,
      });
      if (target !== undefined) {
        return target;
      }
    }
  }
  return undefined;
}

function getDeclarationAnnotationTargetTypeRef(
  declaration: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
  resolveTargetTypeRef: (
    subject: ExtensionFactSubject | undefined,
    context: ExtensionObservationContext,
    options?: TargetTypeRefResolutionOptions,
  ) => TargetTypeRef | undefined,
  options: TargetTypeRefResolutionOptions,
): TargetTypeRef | undefined {
  const declarationNode = asNodeSubject(declaration);
  if (declarationNode === undefined) {
    return undefined;
  }
  const typeNode = asNodeSubject(getNodeField(declarationNode, "Type")) ??
    asNodeSubject(getNodeField(declarationNode, "type"));
  return typeNode === undefined
    ? undefined
    : resolveTargetTypeRef(typeNode, context, options);
}

function safeGetResolvedSymbol(
  subject: ExtensionFactSubject,
  sourceFile: SourceFile,
  context: ExtensionObservationContext,
): ReturnType<NonNullable<ExtensionObservationContext["compiler"]>["checker"]["getResolvedSymbol"]> | undefined {
  const node = asNodeSubject(subject);
  if (node === undefined) {
    return undefined;
  }
  try {
    return context.compiler?.checker.getResolvedSymbol(node, { sourceFile });
  } catch {
    return undefined;
  }
}
