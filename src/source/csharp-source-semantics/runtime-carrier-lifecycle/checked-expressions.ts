import type {
  ExtensionObservationContext,
  Node,
  SourceFile,
  TargetTypeRef,
  Type,
} from "@tsonic/tsts";
import {
  asNodeSubject,
  getNodeField,
  isSemanticTypeQueryableValueExpressionNode,
} from "../ast-utils.js";
import {
  csharpTargetId,
} from "../identity.js";
import {
  createRuntimeCarrierLifecycleObservationContext,
} from "../runtime-carrier-context.js";
import {
  resolveCsharpRuntimeCarrierFromLifecycle,
} from "../runtime-carrier-lifecycle-resolution.js";
import {
  isRuntimeCarrierTypeSyntaxNode,
} from "../runtime-carrier-subjects.js";
import type {
  CsharpRuntimeCarrierSemanticsHost,
} from "../runtime-carrier-types.js";
import type {
  RuntimeCarrierLifecycleFactsContext,
} from "./context.js";

export function getCheckedExpressionRuntimeCarrierTargetTypeRef(
  lifecycleContext: RuntimeCarrierLifecycleFactsContext,
  sourceFile: SourceFile,
  node: Node,
  host: CsharpRuntimeCarrierSemanticsHost,
): TargetTypeRef | undefined {
  const compiler = lifecycleContext.compiler;
  if (
    compiler === undefined ||
    isRuntimeCarrierTypeSyntaxNode(compiler.ast, node) ||
    isControlFlowOnlyRuntimeCarrierSubject(compiler.ast, node) ||
    !isSemanticTypeQueryableValueExpressionNode(compiler.ast, node)
  ) {
    return undefined;
  }
  const type = getCheckedRuntimeCarrierType(compiler, node, sourceFile);
  const context = createRuntimeCarrierLifecycleObservationContext(lifecycleContext);
  const directCarrier = host.getTargetTypeRefForType(type, context, {
    allowRuntimeCarrier: false,
    sourceFile,
  });
  if (directCarrier !== undefined && !shouldDeferNumberLikeSemanticUseSiteCarrier(compiler.ast, node, directCarrier)) {
    return directCarrier;
  }
  if (type === undefined) {
    return undefined;
  }
  if (compiler.typeShape.isAny(type)) {
    const result = resolveCsharpRuntimeCarrierFromLifecycle(lifecycleContext, {
      type,
      target: csharpTargetId,
    }, host);
    return result.kind === "accept" ? result.value.carrier : undefined;
  }
  if (!compiler.typeShape.isUnion(type)) {
    return undefined;
  }
  const result = resolveCsharpRuntimeCarrierFromLifecycle(lifecycleContext, {
    type,
    target: csharpTargetId,
  }, host);
  return result.kind === "accept" ? result.value.carrier : undefined;
}

function shouldDeferNumberLikeSemanticUseSiteCarrier(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
  carrier: TargetTypeRef,
): boolean {
  return carrier.kind === "source-primitive" &&
    carrier.name === "float64" &&
    (
      ast.kindName(node) === "KindIdentifier" ||
      ast.kindName(node) === "KindConditionalExpression"
    );
}

function getCheckedRuntimeCarrierType(
  compiler: NonNullable<ExtensionObservationContext["compiler"]>,
  node: Node,
  sourceFile: SourceFile,
): Type | undefined {
  const typeReference = getContainingTypeReferenceNode(compiler.ast, node);
  if (typeReference !== undefined) {
    return compiler.checker.getTypeFromTypeNode(typeReference, { sourceFile });
  }
  return compiler.checker.getTypeAtLocation(node, { sourceFile });
}

function getContainingTypeReferenceNode(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
): Node | undefined {
  const parent = ast.parent(node);
  return parent !== undefined &&
    ast.is.IsTypeReferenceNode(parent) &&
    asNodeSubject(getNodeField(parent, "TypeName")) === node
    ? parent
    : undefined;
}

function isControlFlowOnlyRuntimeCarrierSubject(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
): boolean {
  switch (ast.kindName(node)) {
    case "KindSourceFile":
    case "KindVariableDeclaration":
    case "KindParameter":
    case "KindPropertyDeclaration":
    case "KindMethodDeclaration":
    case "KindFunctionDeclaration":
    case "KindClassDeclaration":
    case "KindInterfaceDeclaration":
    case "KindEnumDeclaration":
      return true;
    default:
      return false;
  }
}
