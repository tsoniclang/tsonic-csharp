import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  TargetTypeRef,
  Type,
} from "@tsonic/tsts";
import {
  asNodeSubject,
  getNodeNameText,
  isControlFlowLabelIdentifier,
  isSemanticTypeQueryableValueExpressionNode,
  isTypeSyntaxNode,
} from "./ast-utils.js";
import {
  resolveTargetBinding,
} from "./provider-bindings.js";
import type {
  TargetTypeRefResolutionOptions,
} from "./target-member-selection.js";
import {
  asTargetTypeRef,
  asType,
} from "./target-ref-utils.js";
import {
  enrichCsharpTargetTypeRef,
  getCsharpTargetTypeFromBinding,
} from "./target-enrichment.js";
import {
  getTargetTypeRefFromCheckedExpressionSyntax,
  getTargetTypeRefFromSyntax,
} from "./target-type-syntax-resolution.js";
import type {
  CsharpRecursiveTargetTypeResolver,
} from "./target-type-syntax-resolution.js";
import type {
  CsharpTargetTypeResolutionHost,
} from "./target-type-resolution-host.js";
import {
  getCatchVariableTargetTypeRef,
  getProviderVirtualDeclarationTargetTypeRef,
  getTargetTypeRefFromDeclarationAnnotation,
} from "./target-type-resolution-facts.js";
import {
  resolveTargetTypeRefFromSubjectFacts,
} from "./target-type-subject-facts.js";
import {
  getAliasedSymbolIfAvailable,
  getSymbolForDeclarationLookup,
  getSymbolDeclarations,
} from "./symbol-utils.js";
import {
  sourceDeclarationTargetType,
} from "./source-declaration-facts.js";

export type CsharpTargetTypeResolver = (
  type: Type | undefined,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpTargetTypeResolutionHost,
) => TargetTypeRef | undefined;

export function resolveTargetTypeRefForSubjectCore(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpTargetTypeResolutionHost,
  recursiveTargetTypeResolver: CsharpRecursiveTargetTypeResolver,
  resolveTargetTypeRefForType: CsharpTargetTypeResolver,
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
    (factSubject, factContext, factOptions) =>
      resolveTargetTypeRefForSubjectCore(
        factSubject,
        factContext,
        factOptions,
        host,
        recursiveTargetTypeResolver,
        resolveTargetTypeRefForType,
      ),
  );
  if (directFact !== undefined) {
    return directFact;
  }
  const referenceFact = resolveTargetTypeRefFromReferenceFacts(
    subject,
    context,
    options,
    host,
    recursiveTargetTypeResolver,
    resolveTargetTypeRefForType,
  );
  if (referenceFact !== undefined) {
    return referenceFact;
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
    return getCsharpTargetTypeFromBinding(binding, [], host);
  }
  const providerVirtualTarget = getProviderVirtualDeclarationTargetTypeRef(subject, context);
  if (providerVirtualTarget !== undefined) {
    return enrichCsharpTargetTypeRef(providerVirtualTarget, host);
  }
  const syntaxType = getTargetTypeRefFromSyntax(subject, context, options, host, recursiveTargetTypeResolver);
  if (syntaxType !== undefined) {
    return syntaxType;
  }
  const sourceDeclarationTarget = getSourceDeclarationTargetTypeRef(subject, context);
  if (sourceDeclarationTarget !== undefined) {
    return sourceDeclarationTarget;
  }
  const declarationType = getTargetTypeRefFromDeclarationAnnotation(
    subject,
    context,
    options,
    host,
    (declarationSubject, declarationContext, declarationOptions) =>
      resolveTargetTypeRefForSubjectCore(
        declarationSubject,
        declarationContext,
        declarationOptions,
        host,
        recursiveTargetTypeResolver,
        resolveTargetTypeRefForType,
      ),
  );
  if (declarationType !== undefined) {
    return declarationType;
  }
  const node = asNodeSubject(subject);
  const checker = context.compiler?.checker;
  const ast = context.compiler?.ast;
  const type = node === undefined || checker === undefined || options.allowSemanticTypeQuery === false
    ? undefined
    : ast !== undefined && isControlFlowLabelIdentifier(ast, node)
      ? undefined
    : ast !== undefined && isTypeSyntaxNode(ast, node)
      ? asType(checker.getTypeFromTypeNode(node))
    : ast !== undefined && !isSemanticTypeQueryableValueExpressionNode(ast, node)
      ? undefined
      : asType(checker.getTypeAtLocation(node));
  return resolveTargetTypeRefForType(type, context, {
    ...options,
    ...(ast !== undefined && node !== undefined ? { sourceFile: ast.getSourceFile(node) } : {}),
  }, host);
}

function getSourceDeclarationTargetTypeRef(
  subject: ExtensionFactSubject,
  context: ExtensionObservationContext,
): TargetTypeRef | undefined {
  const node = asNodeSubject(subject);
  const ast = context.compiler?.ast;
  const checker = context.compiler?.checker;
  if (node === undefined || ast === undefined || checker === undefined) {
    return undefined;
  }
  const symbol = getSymbolForDeclarationLookup(ast, checker, node, ast.getSourceFile(node));
  for (const declaration of getSymbolDeclarations(symbol)) {
    const kind = ast.kindName(declaration);
    if (kind !== "KindClassDeclaration" && kind !== "KindInterfaceDeclaration" && kind !== "KindEnumDeclaration") {
      continue;
    }
    const name = getNodeNameText(declaration);
    if (name.length === 0) {
      continue;
    }
    return sourceDeclarationTargetType(name, kind);
  }
  return undefined;
}

function resolveTargetTypeRefFromReferenceFacts(
  subject: ExtensionFactSubject,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpTargetTypeResolutionHost,
  recursiveTargetTypeResolver: CsharpRecursiveTargetTypeResolver,
  resolveTargetTypeRefForType: CsharpTargetTypeResolver,
): TargetTypeRef | undefined {
  const node = asNodeSubject(subject);
  const ast = context.compiler?.ast;
  const checker = context.compiler?.checker;
  if (node === undefined || ast === undefined || checker === undefined) {
    return undefined;
  }
  const sourceFile = ast.getSourceFile(node);
  const symbol = getSymbolForDeclarationLookup(ast, checker, node, sourceFile);
  for (const referenceSubject of uniqueReferenceSubjects([
    symbol,
    getAliasedSymbolForReference(symbol, context, sourceFile),
  ])) {
    const fact = resolveTargetTypeRefFromSubjectFacts(
      referenceSubject,
      context,
      options,
      (factSubject, factContext, factOptions) =>
        resolveTargetTypeRefForSubjectCore(
          factSubject,
          factContext,
          factOptions,
          host,
          recursiveTargetTypeResolver,
          resolveTargetTypeRefForType,
        ),
    );
    if (fact !== undefined) {
      return fact;
    }
  }
  return undefined;
}

function getAliasedSymbolForReference(
  symbol: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
  sourceFile: ReturnType<NonNullable<ExtensionObservationContext["compiler"]>["ast"]["getSourceFile"]> | undefined,
): ExtensionFactSubject | undefined {
  const checker = context.compiler?.checker;
  if (checker === undefined) {
    return undefined;
  }
  try {
    return getAliasedSymbolIfAvailable(checker, symbol, sourceFile);
  } catch {
    return undefined;
  }
}

function uniqueReferenceSubjects(subjects: readonly (ExtensionFactSubject | undefined)[]): readonly ExtensionFactSubject[] {
  const seen = new Set<ExtensionFactSubject>();
  const result: ExtensionFactSubject[] = [];
  for (const subject of subjects) {
    if (subject === undefined || seen.has(subject)) {
      continue;
    }
    seen.add(subject);
    result.push(subject);
  }
  return result;
}
