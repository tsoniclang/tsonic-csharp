import {
  runtimeCarrierFactKey,
} from "@tsonic/tsts";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import {
  getRuntimeCarrierSubjectSymbol,
  getRuntimeCarrierSubjectType,
} from "../runtime-carrier-subjects.js";
import type {
  CsharpRuntimeCarrierSemanticsHost,
} from "../runtime-carrier-types.js";
import {
  resolveCsharpRuntimeCarrierFromLifecycle,
} from "../runtime-carrier-lifecycle-resolution.js";
import {
  isObjectLiteralGeneratedShapeCarrier,
  isObjectLiteralInterfaceDeclarationCarrier,
  runtimeCarrierFactIsSafeForSharedSemanticTypeSubject,
} from "./carrier-classification.js";
import type {
  RuntimeCarrierLifecycleFactsContext,
} from "./context.js";

export function recordCsharpRuntimeCarrierFact(
  lifecycleContext: RuntimeCarrierLifecycleFactsContext,
  sourceFile: SourceFile,
  node: Node,
  targetId: string,
  host: CsharpRuntimeCarrierSemanticsHost,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined || lifecycleContext.host.facts.get(node, runtimeCarrierFactKey) !== undefined) {
    return;
  }
  const type = getRuntimeCarrierSubjectType(compiler, sourceFile, node);
  if (type === undefined) {
    return;
  }
  const symbol = getRuntimeCarrierSubjectSymbol(compiler, sourceFile, node);
  const result = resolveCsharpRuntimeCarrierFromLifecycle(lifecycleContext, {
    type,
    target: targetId,
  }, host);
  if (result.kind !== "accept") {
    return;
  }
  const fact = {
    carrier: result.value.carrier,
    ...(result.value.requiresAllocation !== undefined ? { requiresAllocation: result.value.requiresAllocation } : {}),
  };
  if (isObjectLiteralInterfaceDeclarationCarrier(compiler.ast, node, fact.carrier)) {
    return;
  }
  lifecycleContext.host.facts.set(node, runtimeCarrierFactKey, fact, result.evidence ?? []);
  if (
    runtimeCarrierFactIsSafeForSharedSemanticTypeSubject(fact.carrier) &&
    !isObjectLiteralGeneratedShapeCarrier(compiler.ast, node, fact.carrier)
  ) {
    lifecycleContext.host.facts.set(type, runtimeCarrierFactKey, fact, result.evidence ?? []);
  }
  if (symbol !== undefined && !isObjectLiteralGeneratedShapeCarrier(compiler.ast, node, fact.carrier)) {
    lifecycleContext.host.facts.set(symbol, runtimeCarrierFactKey, fact, result.evidence ?? []);
  }
  if (
    type.symbol !== undefined &&
    runtimeCarrierFactIsSafeForSharedSemanticTypeSubject(fact.carrier) &&
    !isObjectLiteralGeneratedShapeCarrier(compiler.ast, node, fact.carrier)
  ) {
    lifecycleContext.host.facts.set(type.symbol, runtimeCarrierFactKey, fact, result.evidence ?? []);
  }
}
