import {
  csharpTargetOperationFactKey,
} from "../../csharp-facts.js";
import type {
  CsharpTargetOperationFact,
} from "../../csharp-facts.js";
import type {
  ExtensionLifecycleContext,
  Node,
} from "@tsonic/tsts";
import {
  isCsharpClosedCompatRuntimeCarrier,
} from "../target-types.js";

export function hasClosedCompatRuntimeOperation(
  node: Node,
  lifecycleContext: Pick<ExtensionLifecycleContext, "host">,
): boolean {
  return isClosedCompatRuntimeOperationFact(lifecycleContext.host.facts.get(node, csharpTargetOperationFactKey));
}

export function isClosedCompatRuntimeOperationFact(operation: CsharpTargetOperationFact | undefined): boolean {
  return operation?.kind === "member" &&
    isCsharpClosedCompatRuntimeCarrier(operation.declaringType);
}
