import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  SourceFile,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  selectedTargetSignatureFactKey,
} from "@tsonic/tsts";
import {
  getRecordedCsharpRuntimeCarrierFact,
} from "../csharp-facts.js";
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
    getResolvedSymbol(node, sourceFile, context),
  ];
  for (const symbol of symbols) {
    for (const declaration of compiler.checker.getSymbolDeclarations(symbol)) {
      const target = getDeclarationAnnotationTargetTypeRef(declaration, context, resolveTargetTypeRef, {
        ...options,
        sourceFile: compiler.ast.getSourceFile(declaration) ?? sourceFile,
      }) ?? getDeclarationInitializerTargetTypeRef(declaration, context);
      if (target !== undefined) {
        return target;
      }
    }
  }
  return undefined;
}

function getDeclarationInitializerTargetTypeRef(
  declaration: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): TargetTypeRef | undefined {
  const declarationNode = asNodeSubject(declaration);
  if (declarationNode === undefined) {
    return undefined;
  }
  const initializer = asNodeSubject(getNodeField(declarationNode, "Initializer")) ??
    asNodeSubject(getNodeField(declarationNode, "initializer"));
  if (initializer === undefined) {
    return undefined;
  }
  const localSelected = context.facts.get(initializer, selectedTargetSignatureFactKey)?.member.returnType;
  const localCarrier = getRecordedCsharpRuntimeCarrierFact(context.facts, initializer)?.carrier;
  const resolvedSelected = context.factResolver.resolve(initializer, selectedTargetSignatureFactKey)?.member.returnType;
  return localSelected ?? localCarrier ?? resolvedSelected;
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

function getResolvedSymbol(
  subject: ExtensionFactSubject,
  sourceFile: SourceFile,
  context: ExtensionObservationContext,
): ReturnType<NonNullable<ExtensionObservationContext["compiler"]>["checker"]["getResolvedSymbol"]> | undefined {
  const node = asNodeSubject(subject);
  if (node === undefined) {
    return undefined;
  }
  return context.compiler?.checker.getResolvedSymbol(node, { sourceFile });
}
