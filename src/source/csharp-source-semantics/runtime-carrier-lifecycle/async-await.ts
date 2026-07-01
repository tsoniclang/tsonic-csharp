import {
  runtimeCarrierFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionFactSubject,
  Node,
  SourceFile,
} from "@tsonic/tsts";
import {
  asNodeSubject,
  getNodeField,
} from "../ast-utils.js";
import {
  targetTypeRefEquals,
} from "../target-ref-utils.js";
import {
  getCsharpTaskResultTargetType,
} from "../target-types.js";
import type {
  RuntimeCarrierFact,
  RuntimeCarrierLifecycleFactsContext,
} from "./context.js";
import {
  setRuntimeCarrierFactIfUnresolved,
} from "./fact-writes.js";

export function recordCsharpAsyncAwaitRuntimeCarrierFacts(
  lifecycleContext: RuntimeCarrierLifecycleFactsContext,
  sourceFile: SourceFile,
  nodes: readonly Node[],
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return;
  }
  for (const node of [...nodes].reverse()) {
    if (compiler.ast.kindName(node) !== "KindAwaitExpression") {
      continue;
    }
    recordAwaitExpressionRuntimeCarrierFact(lifecycleContext, node);
  }
  void sourceFile;
}

function recordAwaitExpressionRuntimeCarrierFact(
  lifecycleContext: RuntimeCarrierLifecycleFactsContext,
  awaitExpression: Node,
): void {
  const awaitedExpression = asNodeSubject(getNodeField(awaitExpression, "Expression"));
  const awaitedCarrier = getResolvedRuntimeCarrierFact(lifecycleContext, awaitedExpression)?.carrier;
  const awaitResultCarrier = getCsharpTaskResultTargetType(awaitedCarrier);
  if (awaitResultCarrier === undefined) {
    return;
  }
  const existing = getResolvedRuntimeCarrierFact(lifecycleContext, awaitExpression);
  if (existing !== undefined && !targetTypeRefEquals(existing.carrier, awaitResultCarrier)) {
    return;
  }
  setRuntimeCarrierFactIfUnresolved(
    lifecycleContext,
    awaitExpression,
    { carrier: awaitResultCarrier },
    [{
      message: "C# await expression result carrier recorded from finalized awaited Promise/Task carrier facts.",
    }],
  );
}

function getResolvedRuntimeCarrierFact(
  lifecycleContext: RuntimeCarrierLifecycleFactsContext,
  subject: ExtensionFactSubject | undefined,
): RuntimeCarrierFact | undefined {
  return subject === undefined
    ? undefined
    : lifecycleContext.host.facts.get(subject, runtimeCarrierFactKey) ??
      lifecycleContext.host.factResolver.resolve(subject, runtimeCarrierFactKey);
}
