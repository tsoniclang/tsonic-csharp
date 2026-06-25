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
  try {
    const type = getCheckedRuntimeCarrierType(compiler, node, sourceFile);
    const context = createRuntimeCarrierLifecycleObservationContext(lifecycleContext);
    const directCarrier = host.getTargetTypeRefForType(type, context, {
      allowRuntimeCarrier: false,
      sourceFile,
    });
    if (directCarrier !== undefined) {
      return directCarrier;
    }
    if (type === undefined) {
      return undefined;
    }
    if (compiler.types.isAny(type)) {
      const result = resolveCsharpRuntimeCarrierFromLifecycle(lifecycleContext, {
        type,
        sourceTypeReference: node,
        target: csharpTargetId,
      }, host);
      return result.kind === "accept" ? result.value.carrier : undefined;
    }
    if (!compiler.types.isUnion(type)) {
      return undefined;
    }
    const result = resolveCsharpRuntimeCarrierFromLifecycle(lifecycleContext, {
      type,
      sourceTypeReference: node,
      target: csharpTargetId,
    }, host);
    return result.kind === "accept" ? result.value.carrier : undefined;
  } catch {
    return undefined;
  }
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
