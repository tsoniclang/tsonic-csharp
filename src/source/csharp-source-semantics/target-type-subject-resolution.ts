import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  Node,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  asNodeSubject,
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
  getCallableExpressionTargetTypeRefForSubject,
} from "./target-type-subject-resolution/callable-expression.js";
import {
  getPreferredTargetTypeRefForSubject,
} from "./target-type-subject-resolution/preference.js";
import {
  resolveTargetTypeRefFromReferenceFacts,
} from "./target-type-subject-resolution/reference-facts.js";
import {
  getSourceDeclarationTargetTypeRef,
} from "./target-type-subject-resolution/source-declaration.js";
import type {
  CsharpTargetTypeResolver,
} from "./target-type-subject-resolution/types.js";
import {
  resolveTargetTypeRefFromSubjectFacts,
} from "./target-type-subject-facts.js";
import {
  typeSyntaxContainsSourcePrimitiveEvidence,
} from "./source-primitive-evidence.js";

export type {
  CsharpTargetTypeResolver,
} from "./target-type-subject-resolution/types.js";

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
  const node = asNodeSubject(subject);
  const checker = context.compiler?.checker;
  const ast = context.compiler?.ast;
  if (node !== undefined && ast !== undefined && isTypeSyntaxNode(ast, node)) {
    const syntaxType = getTargetTypeRefFromSyntax(subject, context, options, host, recursiveTargetTypeResolver);
    if (syntaxType !== undefined) {
      return syntaxType;
    }
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
  if (directFact !== undefined && node !== undefined && ast !== undefined && isTypeSyntaxNode(ast, node)) {
    return directFact;
  }
  const referenceFact = resolveTargetTypeRefFromReferenceFacts(
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
  const preferredFact = getPreferredTargetTypeRefForSubject(directFact, referenceFact, declarationType);
  if (preferredFact !== undefined) {
    const checkedExpressionType = getCheckedExpressionSemanticTargetTypeIfMoreSpecific(
      preferredFact,
      node,
      checker,
      ast,
      context,
      options,
      host,
      resolveTargetTypeRefForType,
    );
    if (checkedExpressionType !== undefined) {
      return checkedExpressionType;
    }
    return preferredFact;
  }
  if (directFact === undefined && referenceFact === undefined && declarationType !== undefined) {
    return declarationType;
  }
  if (referenceFact !== undefined) {
    return referenceFact;
  }
  const expressionResult = getTargetTypeRefFromCheckedExpressionSyntax(subject, context, options, host, recursiveTargetTypeResolver);
  if (expressionResult !== undefined) {
    return expressionResult;
  }
  const catchVariableType = getCatchVariableTargetTypeRef(subject, context, host.getCatchVariableTargetTypeRef?.());
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
  const syntaxType = node !== undefined && ast !== undefined && isTypeSyntaxNode(ast, node)
    ? undefined
    : getTargetTypeRefFromSyntax(subject, context, options, host, recursiveTargetTypeResolver);
  if (syntaxType !== undefined) {
    return syntaxType;
  }
  const sourceDeclarationTarget = getSourceDeclarationTargetTypeRef(subject, context);
  if (sourceDeclarationTarget !== undefined) {
    return sourceDeclarationTarget;
  }
  const callableExpressionTarget = options.allowSemanticTypeQuery === false
    ? undefined
    : getCallableExpressionTargetTypeRefForSubject(
        subject,
        context,
        options,
        host,
        (callableSubject, callableContext, callableOptions, callableHost) =>
          resolveTargetTypeRefForSubjectCore(
            callableSubject,
            callableContext,
            callableOptions,
            callableHost,
            recursiveTargetTypeResolver,
            resolveTargetTypeRefForType,
          ),
        resolveTargetTypeRefForType,
      );
  if (callableExpressionTarget !== undefined) {
    return callableExpressionTarget;
  }
  const type = node === undefined || checker === undefined || options.allowSemanticTypeQuery === false
    ? undefined
    : ast !== undefined && isControlFlowLabelIdentifier(ast, node)
      ? undefined
    : ast !== undefined && isTypeSyntaxNode(ast, node)
      ? asType(checker.getTypeFromTypeNode(node))
    : ast !== undefined && !isSemanticTypeQueryableValueExpressionNode(ast, node)
      ? undefined
      : asType(checker.getTypeAtLocation(node));
  const semanticResult = resolveTargetTypeRefForType(type, context, {
    ...options,
    ...(ast !== undefined && node !== undefined ? { sourceFile: ast.getSourceFile(node) } : {}),
  }, host);
  if (
    semanticResult !== undefined &&
    node !== undefined &&
    ast !== undefined &&
    checker !== undefined &&
    isTypeSyntaxNode(ast, node) &&
    typeSyntaxContainsSourcePrimitiveEvidence(node, context)
  ) {
    return undefined;
  }
  return semanticResult;
}

function getCheckedExpressionSemanticTargetTypeIfMoreSpecific(
  preferredFact: TargetTypeRef,
  node: Node | undefined,
  checker: NonNullable<ExtensionObservationContext["compiler"]>["checker"] | undefined,
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"] | undefined,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpTargetTypeResolutionHost,
  resolveTargetTypeRefForType: CsharpTargetTypeResolver,
): TargetTypeRef | undefined {
  if (
    preferredFact.kind !== "type-parameter" ||
    node === undefined ||
    checker === undefined ||
    ast === undefined ||
    options.allowSemanticTypeQuery === false ||
    !isSemanticTypeQueryableValueExpressionNode(ast, node)
  ) {
    return undefined;
  }
  const sourceFile = ast.getSourceFile(node);
  const checkedType = asType(checker.getTypeAtLocation(node, { sourceFile }));
  const checkedTarget = resolveTargetTypeRefForType(checkedType, context, {
    ...options,
    sourceFile,
  }, host);
  return checkedTarget === undefined || checkedTarget.kind === "type-parameter"
    ? undefined
    : checkedTarget;
}
