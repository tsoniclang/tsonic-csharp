import {
  runtimeCarrierFactKey,
} from "@tsonic/tsts";
import type {
  Node,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  asNodeSubject,
  getNodeField,
} from "../ast-utils.js";
import {
  targetTypeRefEquals,
} from "../target-ref-utils.js";
import type {
  RuntimeCarrierLifecycleFactsContext,
} from "./context.js";

export function getConditionalExpressionRuntimeCarrierTargetTypeRef(
  lifecycleContext: RuntimeCarrierLifecycleFactsContext,
  node: Node,
): TargetTypeRef | undefined {
  const ast = lifecycleContext.compiler?.ast;
  if (ast === undefined || ast.kindName(node) !== "KindConditionalExpression") {
    return undefined;
  }
  const whenTrue = asNodeSubject(getNodeField(node, "WhenTrue"));
  const whenFalse = asNodeSubject(getNodeField(node, "WhenFalse"));
  const trueCarrier = getRuntimeCarrier(lifecycleContext, whenTrue);
  const falseCarrier = getRuntimeCarrier(lifecycleContext, whenFalse);
  if (trueCarrier === undefined || falseCarrier === undefined) {
    return undefined;
  }
  return targetTypeRefEquals(trueCarrier, falseCarrier) ? trueCarrier : undefined;
}

function getRuntimeCarrier(
  lifecycleContext: RuntimeCarrierLifecycleFactsContext,
  node: Node | undefined,
): TargetTypeRef | undefined {
  return node === undefined
    ? undefined
    : lifecycleContext.host.facts.get(node, runtimeCarrierFactKey)?.carrier ??
      lifecycleContext.host.factResolver.resolve(node, runtimeCarrierFactKey)?.carrier;
}
