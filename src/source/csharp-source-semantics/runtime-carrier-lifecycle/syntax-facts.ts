import {
  selectedTargetSignatureFactKey,
  runtimeCarrierFactKey,
  targetConversionFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionObservationContext,
  Node,
  SourceFile,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  csharpTargetOperationFactKey,
  csharpObjectShapeFactKey,
} from "../../csharp-facts.js";
import {
  isLiteralValueSyntaxNode,
  isSemanticTypeQueryableValueExpressionNode,
} from "../ast-utils.js";
import {
  createRuntimeCarrierLifecycleObservationContext,
} from "../runtime-carrier-context.js";
import {
  getObservedRuntimeCarrierSyntaxTargetTypeRef,
  getRuntimeCarrierSyntaxTargetTypeRef,
} from "../runtime-carrier-lifecycle-resolution.js";
import {
  getRuntimeCarrierSubjectSymbol,
  isRuntimeCarrierTypeSyntaxNode,
} from "../runtime-carrier-subjects.js";
import type {
  CsharpRuntimeCarrierSemanticsHost,
} from "../runtime-carrier-types.js";
import {
  getCatchVariableTargetTypeRef,
} from "../target-type-resolution-facts.js";
import {
  targetTypeRefIsClosed,
} from "../target-ref-utils.js";
import {
  isCsharpSourceOwnedSelectedSignature,
} from "../source-owned-selected-signature.js";
import {
  getCallableExpressionRuntimeCarrierTargetTypeRef,
} from "./callable-expressions.js";
import {
  getConditionalExpressionRuntimeCarrierTargetTypeRef,
} from "./conditional-expressions.js";
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
  const catchVariableCarrier = getCatchVariableTargetTypeRef(node, context, host.getCatchVariableTargetTypeRef?.());
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
  if (!isRuntimeCarrierSyntaxFactCandidate(compiler.ast, node)) {
    return;
  }
  if (isSourceOwnedArrayOperationExpression(lifecycleContext, node)) {
    return;
  }
  const carrier = getObservedRuntimeCarrierSyntaxTargetTypeRef(lifecycleContext, node, host) ??
    getConditionalExpressionRuntimeCarrierTargetTypeRef(lifecycleContext, node) ??
    getRuntimeCarrierSyntaxTargetTypeRef(lifecycleContext, node, host) ??
    getClosedSyntaxRuntimeCarrier(lifecycleContext, node, host) ??
    getCallableExpressionRuntimeCarrierTargetTypeRef(lifecycleContext, node, host) ??
    getUseSiteRuntimeCarrierTargetTypeRef(lifecycleContext, sourceFile, node, host);
  if (carrier === undefined) {
    return;
  }
  const fact = { carrier };
  const evidence = [{ message: "C# runtime carrier recorded from source syntax/provider facts." }];
  lifecycleContext.host.facts.set(node, runtimeCarrierFactKey, fact, evidence);
}

function isSourceOwnedArrayOperationExpression(
  lifecycleContext: RuntimeCarrierLifecycleFactsContext,
  node: Node,
): boolean {
  const ast = lifecycleContext.compiler?.ast;
  if (ast === undefined || (!ast.is.IsCallExpression(node) && !ast.is.IsNewExpression(node) && !ast.is.IsAwaitExpression(node))) {
    return false;
  }
  const selected = lifecycleContext.host.facts.get(node, selectedTargetSignatureFactKey);
  return selected !== undefined &&
    isCsharpSourceOwnedSelectedSignature(selected) &&
    selected.member.returnType?.kind === "array";
}

function getClosedSyntaxRuntimeCarrier(
  lifecycleContext: RuntimeCarrierLifecycleFactsContext,
  node: Node,
  host: CsharpRuntimeCarrierSemanticsHost,
): TargetTypeRef | undefined {
  const finalizedOperationCarrier = lifecycleContext.host.facts.get(node, csharpTargetOperationFactKey)?.resultType ??
    lifecycleContext.host.factResolver.resolve(node, csharpTargetOperationFactKey)?.resultType;
  if (finalizedOperationCarrier !== undefined && targetTypeRefIsClosed(finalizedOperationCarrier)) {
    return finalizedOperationCarrier;
  }
  const carrier = host.getTargetTypeRefForSubject(
    node,
    createRuntimeCarrierLifecycleObservationContext(lifecycleContext),
    {
      allowRuntimeCarrier: false,
      allowSemanticTypeQuery: false,
    },
  );
  if (carrier !== undefined && targetTypeRefIsClosed(carrier)) {
    return carrier;
  }
  const convertedCarrier = lifecycleContext.host.facts.get(node, targetConversionFactKey)?.convertedType ??
    lifecycleContext.host.factResolver.resolve(node, targetConversionFactKey)?.convertedType;
  return convertedCarrier === undefined || !targetTypeRefIsClosed(convertedCarrier)
    ? undefined
    : convertedCarrier;
}

function isObjectShapeRuntimeCarrierSyntaxNode(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
): boolean {
  return ast.is.IsObjectLiteralExpression(node) ||
    ast.is.IsTypeLiteralNode(node);
}

function isRuntimeCarrierSyntaxFactCandidate(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
): boolean {
  if (isRuntimeCarrierTypeSyntaxNode(ast, node)) {
    return false;
  }
  if (ast.kindName(node) === "KindAwaitExpression") {
    return false;
  }
  return ast.is.IsRegularExpressionLiteral(node) ||
    ast.is.IsNewExpression(node) ||
    isLiteralValueSyntaxNode(ast, node) ||
    isSemanticTypeQueryableValueExpressionNode(ast, node);
}
