import {
  createRuntimeCarrierLifecycleObservationContext,
} from "../../../runtime-carriers.js";
import type {
  CsharpOperationsProviderHost,
} from "../../../operations-provider.js";
import {
  recordArrayParameterFacts,
  recordArrayReturnFacts,
} from "./facts.js";
import {
  collectArrayParameters,
  collectArrayReturnTypeNodes,
} from "./traversal.js";
import type {
  LifecycleContext,
} from "./types.js";

export function recordCsharpJsArrayCarrierFactsBeforeFinalization(
  lifecycleContext: LifecycleContext,
  host: Pick<CsharpOperationsProviderHost, "getTargetTypeRefForSubject">,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return;
  }
  const context = createRuntimeCarrierLifecycleObservationContext(lifecycleContext);
  for (const sourceFile of compiler.getSourceFiles()) {
    if (sourceFile === undefined || sourceFile.IsDeclarationFile === true) {
      continue;
    }
    for (const parameter of collectArrayParameters(sourceFile, lifecycleContext, host)) {
      recordArrayParameterFacts(parameter, lifecycleContext, context);
    }
    for (const returnType of collectArrayReturnTypeNodes(sourceFile, lifecycleContext, host)) {
      recordArrayReturnFacts(returnType, lifecycleContext);
    }
  }
}
