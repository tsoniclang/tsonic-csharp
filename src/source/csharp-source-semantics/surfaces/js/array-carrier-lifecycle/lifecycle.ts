import {
  createRuntimeCarrierLifecycleObservationContext,
} from "../../../runtime-carriers.js";
import {
  createLazyTargetSourceAnalysis,
} from "@tsonic/target-api";
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
  const userSourceFiles = compiler.getSourceFiles().filter(
    (sourceFile): sourceFile is NonNullable<typeof sourceFile> =>
      sourceFile !== undefined && sourceFile.IsDeclarationFile !== true,
  );
  const analysisContext = {
    ...lifecycleContext,
    analysis: lifecycleContext.analysis ?? createLazyTargetSourceAnalysis(
      compiler.ast,
      compiler.checker,
      userSourceFiles,
    ),
  };
  const context = createRuntimeCarrierLifecycleObservationContext(lifecycleContext);
  for (const sourceFile of userSourceFiles) {
    for (const parameter of collectArrayParameters(sourceFile, analysisContext, host)) {
      recordArrayParameterFacts(parameter, analysisContext, context);
    }
    for (const returnType of collectArrayReturnTypeNodes(sourceFile, analysisContext, host)) {
      recordArrayReturnFacts(returnType, analysisContext);
    }
  }
}
