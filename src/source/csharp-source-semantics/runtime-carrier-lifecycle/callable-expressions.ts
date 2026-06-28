import type {
  Node,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  getCallableExpressionTargetTypeRef,
  isCallableExpressionNode,
} from "../callable-target-types.js";
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
  getRuntimeCarrierSubjectType,
} from "../runtime-carrier-subjects.js";
import type {
  CsharpRuntimeCarrierSemanticsHost,
} from "../runtime-carrier-types.js";
import type {
  RuntimeCarrierLifecycleFactsContext,
} from "./context.js";

export function getCallableExpressionRuntimeCarrierTargetTypeRef(
  lifecycleContext: RuntimeCarrierLifecycleFactsContext,
  node: Node,
  host: CsharpRuntimeCarrierSemanticsHost,
): TargetTypeRef | undefined {
  const compiler = lifecycleContext.compiler;
  const sourceFile = compiler?.ast.getSourceFile(node);
  if (
    compiler === undefined ||
    sourceFile === undefined ||
    !isCallableExpressionNode(compiler.ast, node)
  ) {
    return undefined;
  }
  const type = getRuntimeCarrierSubjectType(compiler, sourceFile, node);
  if (type === undefined) {
    return undefined;
  }
  const checkedCallable = getCallableExpressionTargetTypeRef(
    node,
    type,
    sourceFile,
    createRuntimeCarrierLifecycleObservationContext(lifecycleContext),
    host,
  );
  if (checkedCallable !== undefined) {
    return checkedCallable;
  }
  const result = resolveCsharpRuntimeCarrierFromLifecycle(lifecycleContext, {
    type,
    target: csharpTargetId,
  }, host);
  return result.kind === "accept" ? result.value.carrier : undefined;
}
