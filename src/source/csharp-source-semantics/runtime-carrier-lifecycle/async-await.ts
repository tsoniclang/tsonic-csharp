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
import type {
  CsharpRuntimeCarrierSemanticsHost,
} from "../runtime-carrier-types.js";
import {
  createRuntimeCarrierLifecycleObservationContext,
} from "../runtime-carrier-context.js";

export function recordCsharpAsyncAwaitRuntimeCarrierFacts(
  lifecycleContext: RuntimeCarrierLifecycleFactsContext,
  sourceFile: SourceFile,
  nodes: readonly Node[],
  host: CsharpRuntimeCarrierSemanticsHost,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return;
  }
  for (const node of [...nodes].reverse()) {
    if (compiler.ast.kindName(node) !== "KindAwaitExpression") {
      continue;
    }
    recordAwaitExpressionRuntimeCarrierFact(lifecycleContext, node, sourceFile, host);
  }
}

function recordAwaitExpressionRuntimeCarrierFact(
  lifecycleContext: RuntimeCarrierLifecycleFactsContext,
  awaitExpression: Node,
  sourceFile: SourceFile,
  host: CsharpRuntimeCarrierSemanticsHost,
): void {
  const awaitedExpression = asNodeSubject(getNodeField(awaitExpression, "Expression"));
  const awaitedCarrier = getResolvedRuntimeCarrierFact(lifecycleContext, awaitedExpression, sourceFile, host)?.carrier;
  const awaitResultCarrier = getCsharpTaskResultTargetType(awaitedCarrier);
  if (awaitResultCarrier === undefined) {
    return;
  }
  const existing = getResolvedRuntimeCarrierFact(lifecycleContext, awaitExpression, sourceFile, host);
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
  sourceFile: SourceFile,
  host: CsharpRuntimeCarrierSemanticsHost,
): RuntimeCarrierFact | undefined {
  if (subject === undefined) {
    return undefined;
  }
  const fact = lifecycleContext.host.facts.get(subject, runtimeCarrierFactKey) ??
    lifecycleContext.host.factResolver.resolve(subject, runtimeCarrierFactKey);
  if (fact !== undefined) {
    return fact;
  }
  const context = createRuntimeCarrierLifecycleObservationContext(lifecycleContext);
  const carrier = host.getTargetTypeRefForSubject(subject, context, {
    allowRuntimeCarrier: true,
    allowSemanticTypeQuery: false,
    sourceFile,
  });
  return carrier === undefined ? undefined : { carrier };
}
