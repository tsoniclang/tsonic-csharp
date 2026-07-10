import {
  structFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionObservationContext,
  Node,
} from "@tsonic/tsts";

export function isSourceCoreStructMarkerCallExpression(
  callExpression: Node,
  context: ExtensionObservationContext,
): boolean {
  return context.factResolver.resolve(callExpression, structFactKey) !== undefined ||
    context.facts.get(callExpression, structFactKey) !== undefined;
}
