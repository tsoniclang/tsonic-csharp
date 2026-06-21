import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
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
    : ast !== undefined && isTypeSyntaxNode(ast, node)
      ? asType(checker.getTypeFromTypeNode(node))
      : asType(checker.getTypeAtLocation(node));
  return resolveTargetTypeRefForType(type, context, {
    ...options,
    ...(ast !== undefined && node !== undefined ? { sourceFile: ast.getSourceFile(node) } : {}),
  }, host);
}
