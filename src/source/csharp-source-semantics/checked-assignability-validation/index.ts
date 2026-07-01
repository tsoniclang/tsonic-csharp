import {
  acceptObservation,
  deferObservation,
  ExtensionObservationPoint,
} from "@tsonic/tsts";
import type {
  ExtensionEvidence,
  ExtensionLifecycleContext,
  ExtensionObservation,
  ExtensionObservationContext,
  Node,
  PostCheckAssignabilityObservationRequest,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  CsharpObservedTargetAssignabilityFact,
} from "../../csharp-facts.js";
import {
  csharpObservedTargetAssignabilityFactKey,
  csharpTargetOperationFactKey,
} from "../../csharp-facts.js";
import {
  getAstReaderChildNodes,
} from "../ast-utils.js";
import {
  csharpProviderDiagnostic,
} from "../diagnostics.js";
import {
  getNodeField,
} from "../ast-utils.js";
import {
  csharpTargetId,
} from "../identity.js";
import {
  isClosedCompatRuntimeOperationFact,
} from "../opaque-any-diagnostics/closed-compat.js";
import {
  getBinaryOperatorText,
} from "../operator-syntax.js";
import type {
  CsharpOperationsProviderHost,
} from "../operations-provider.js";
import {
  canUseObservedContextSubject,
  getObservedAssignabilitySourceFile,
  isInferredLocalAssignmentObservation,
  resolveObservedAssignabilitySourceNode,
  resolveObservedAssignabilityTargetNode,
} from "./context-nodes.js";
import {
  validateObservedAssignmentTargetFact,
} from "./member-write.js";
import {
  asNode,
  subjectIdentity,
} from "./subjects.js";
import {
  validateCsharpTargetAssignability,
} from "./target-assignability.js";
import {
  diagnoseAnyTypedBoundaryForNode,
} from "./typed-boundary.js";

export function observeCsharpPostCheckAssignability(
  request: PostCheckAssignabilityObservationRequest,
  context: ExtensionObservationContext<"target.observePostCheckAssignability">,
  host: CsharpOperationsProviderHost,
): ExtensionObservation<void> {
  void host;
  if (request.targetPlatform !== undefined && request.targetPlatform !== csharpTargetId) {
    return deferObservation;
  }
  const subject = request.expression ?? request.errorNode ?? request.target;
  context.facts.set(subject, csharpObservedTargetAssignabilityFactKey, {
    source: request.source,
    target: request.target,
    ...(request.relation !== undefined ? { relation: request.relation } : {}),
    ...(request.errorNode !== undefined ? { errorNode: request.errorNode } : {}),
    ...(request.expression !== undefined ? { expression: request.expression } : {}),
  }, [{ message: "C# target assignability observation recorded after TSTS accepted the TypeScript relation; target validation is deferred until semantic finalization." }]);
  return acceptObservation(undefined, [{ message: "C# post-check target assignability observed without querying or changing the TSTS assignability relation." }]);
}

export function validateCsharpObservedAssignabilityFactsBeforeFinalization(
  lifecycleContext: Pick<ExtensionLifecycleContext, "extensionId" | "host" | "compiler">,
  host: CsharpOperationsProviderHost,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return;
  }
  const context = {
    observation: ExtensionObservationPoint.observePostCheckAssignability,
    extensionId: lifecycleContext.extensionId,
    host: lifecycleContext.host,
    facts: lifecycleContext.host.facts,
    factResolver: lifecycleContext.host.factResolver,
    diagnostics: lifecycleContext.host.diagnostics,
    compiler,
  } satisfies ExtensionObservationContext<"target.observePostCheckAssignability">;
  for (const sourceFile of compiler.getSourceFiles()) {
    if (sourceFile === undefined || sourceFile.IsDeclarationFile === true) {
      continue;
    }
    validateObservedAssignabilityFactsForNode(sourceFile, context, host);
  }
}

function validateObservedAssignabilityFactsForNode(
  node: Node | undefined,
  context: ExtensionObservationContext<"target.observePostCheckAssignability">,
  host: CsharpOperationsProviderHost,
): void {
  if (node === undefined) {
    return;
  }
  for (const child of getAstReaderChildNodes(context.compiler!.ast, node)) {
    validateObservedAssignabilityFactsForNode(child, context, host);
  }
  const fact = context.facts.get(node, csharpObservedTargetAssignabilityFactKey);
  if (fact === undefined) {
    return;
  }
  validateObservedAssignmentTargetFact(fact, context);
  if (diagnoseAnyTypedBoundaryForNode(node, context)) {
    return;
  }
  if (isCompatRuntimeAssignmentObservation(fact, context)) {
    return;
  }
  if (isInferredLocalAssignmentObservation(fact, context)) {
    return;
  }
  const source = resolveObservedAssignabilitySource(fact, context, host);
  const target = resolveObservedAssignabilityTarget(fact, context, host);
  const validation = validateCsharpTargetAssignability(source, target, host, new Set());
  if (validation.kind !== "invalid") {
    return;
  }
  context.diagnostics.append({
    ...csharpProviderDiagnostic(
      context.extensionId,
      "CSHARP_TARGET_ASSIGNABILITY_INVALID",
      9100120,
      validation.message,
    ),
    nodeOrSpan: fact.expression ?? fact.errorNode,
    evidence: [
      ...getObservedAssignabilityEvidence(fact, context, source, target),
      ...validation.evidence,
    ],
    identity: `csharp-target-assignability:${subjectIdentity(fact.expression ?? fact.errorNode ?? fact.target)}`,
  });
}

function isCompatRuntimeAssignmentObservation(
  fact: CsharpObservedTargetAssignabilityFact,
  context: ExtensionObservationContext<"target.observePostCheckAssignability">,
): boolean {
  const compiler = context.compiler;
  const target = asNode(fact.errorNode) ?? asNode(fact.target);
  if (compiler === undefined || target === undefined) {
    return false;
  }
  const parent = compiler.ast.parent(target);
  if (parent === undefined || !compiler.ast.is.IsBinaryExpression(parent) || getBinaryOperatorText(compiler.ast, parent) !== "=") {
    return false;
  }
  if (asNode(getNodeField(parent, "Left")) !== target) {
    return false;
  }
  return isClosedCompatRuntimeOperationFact(context.factResolver.resolve(parent, csharpTargetOperationFactKey) ?? context.facts.get(parent, csharpTargetOperationFactKey));
}

function resolveObservedAssignabilitySource(
  fact: CsharpObservedTargetAssignabilityFact,
  context: ExtensionObservationContext<"target.observePostCheckAssignability">,
  host: CsharpOperationsProviderHost,
): TargetTypeRef | undefined {
  const source = host.getTargetTypeRefForSubject(fact.source, context, {
    allowRuntimeCarrier: true,
    allowSemanticTypeQuery: true,
    sourceFile: getObservedAssignabilitySourceFile(fact, context),
  });
  return source !== undefined || !canUseObservedContextSubject(fact.source)
    ? source
    : host.getTargetTypeRefForSubject(resolveObservedAssignabilitySourceNode(fact, context), context, {
        allowRuntimeCarrier: true,
        allowSemanticTypeQuery: true,
        sourceFile: getObservedAssignabilitySourceFile(fact, context),
      });
}

function resolveObservedAssignabilityTarget(
  fact: CsharpObservedTargetAssignabilityFact,
  context: ExtensionObservationContext<"target.observePostCheckAssignability">,
  host: CsharpOperationsProviderHost,
): TargetTypeRef | undefined {
  const target = host.getTargetTypeRefForSubject(fact.target, context, {
    allowRuntimeCarrier: true,
    allowSemanticTypeQuery: true,
    sourceFile: getObservedAssignabilitySourceFile(fact, context),
  });
  return target !== undefined || !canUseObservedContextSubject(fact.target)
    ? target
    : host.getTargetTypeRefForSubject(resolveObservedAssignabilityTargetNode(fact, context), context, {
        allowRuntimeCarrier: true,
        allowSemanticTypeQuery: true,
        sourceFile: getObservedAssignabilitySourceFile(fact, context),
      });
}

function getObservedAssignabilityEvidence(
  fact: CsharpObservedTargetAssignabilityFact,
  context: ExtensionObservationContext<"target.observePostCheckAssignability">,
  source: TargetTypeRef | undefined,
  target: TargetTypeRef | undefined,
): readonly ExtensionEvidence[] {
  const expression = asNode(fact.expression ?? fact.errorNode);
  const ast = context.compiler?.ast;
  return [{
    message: "Observed assignability relation",
    details: {
      relation: fact.relation,
      expressionKind: expression === undefined || ast === undefined ? undefined : ast.kindName(expression),
      sourceResolved: source !== undefined,
      targetResolved: target !== undefined,
    },
  }];
}
