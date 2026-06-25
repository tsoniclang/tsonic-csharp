import {
  runtimeCarrierFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionObservationContext,
  Node,
  SourceFile,
} from "@tsonic/tsts";
import {
  csharpObjectShapeFactKey,
} from "../../csharp-facts.js";
import {
  createRuntimeCarrierLifecycleObservationContext,
} from "../runtime-carrier-context.js";
import {
  getObservedRuntimeCarrierSyntaxTargetTypeRef,
  getRuntimeCarrierSyntaxTargetTypeRef,
} from "../runtime-carrier-lifecycle-resolution.js";
import {
  getRuntimeCarrierSubjectSymbol,
} from "../runtime-carrier-subjects.js";
import type {
  CsharpRuntimeCarrierSemanticsHost,
} from "../runtime-carrier-types.js";
import {
  getCatchVariableTargetTypeRef,
} from "../target-type-resolution-facts.js";
import {
  getCallableExpressionRuntimeCarrierTargetTypeRef,
} from "./callable-expressions.js";
import type {
  RuntimeCarrierLifecycleFactsContext,
} from "./context.js";
import {
  getUseSiteRuntimeCarrierTargetTypeRef,
} from "./use-site-facts.js";

export function recordCsharpRuntimeCarrierSyntaxFact(
  lifecycleContext: RuntimeCarrierLifecycleFactsContext,
  sourceFile: SourceFile,
  node: Node,
  host: CsharpRuntimeCarrierSemanticsHost,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined || lifecycleContext.host.facts.get(node, runtimeCarrierFactKey) !== undefined) {
    return;
  }
  const context = createRuntimeCarrierLifecycleObservationContext(lifecycleContext);
  const catchVariableCarrier = getCatchVariableTargetTypeRef(node, context, host.getCatchExceptionTargetTypeRef?.());
  if (catchVariableCarrier !== undefined) {
    const fact = { carrier: catchVariableCarrier };
    const evidence = [{ message: "C# catch variable runtime carrier recorded from finalized provider exception policy." }];
    lifecycleContext.host.facts.set(node, runtimeCarrierFactKey, fact, evidence);
    const sourceFile = compiler.ast.getSourceFile(node);
    const symbol = sourceFile === undefined
      ? undefined
      : getRuntimeCarrierSubjectSymbol(compiler, sourceFile, node);
    if (symbol !== undefined) {
      lifecycleContext.host.facts.set(symbol, runtimeCarrierFactKey, fact, evidence);
    }
    return;
  }
  if (isObjectShapeRuntimeCarrierSyntaxNode(compiler.ast, node)) {
    const objectShape = host.getCsharpObjectShapeFactForSubject(node, context);
    if (objectShape !== undefined) {
      const evidence = [{ message: "C# runtime carrier recorded from finalized object-shape facts." }];
      lifecycleContext.host.facts.set(node, csharpObjectShapeFactKey, objectShape, evidence);
      lifecycleContext.host.facts.set(node, runtimeCarrierFactKey, { carrier: objectShape.targetType }, evidence);
      return;
    }
  }
  const carrier = getObservedRuntimeCarrierSyntaxTargetTypeRef(lifecycleContext, node, host) ??
    getCallableExpressionRuntimeCarrierTargetTypeRef(lifecycleContext, node, host) ??
    getRuntimeCarrierSyntaxTargetTypeRef(lifecycleContext, node, host) ??
    getUseSiteRuntimeCarrierTargetTypeRef(lifecycleContext, sourceFile, node, host);
  if (carrier === undefined) {
    return;
  }
  const fact = { carrier };
  const evidence = [{ message: "C# runtime carrier recorded from source syntax/provider facts." }];
  lifecycleContext.host.facts.set(node, runtimeCarrierFactKey, fact, evidence);
}

function isObjectShapeRuntimeCarrierSyntaxNode(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
): boolean {
  return ast.is.IsObjectLiteralExpression(node) ||
    ast.is.IsTypeLiteralNode(node);
}
