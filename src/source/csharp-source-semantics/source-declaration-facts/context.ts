import type {
  ExtensionCompilerQueryContext,
  ExtensionLifecycleContext,
  ImmediateExtensionObservationContext,
} from "@tsonic/tsts";

export type SourceDeclarationLifecycleContext = Pick<ExtensionLifecycleContext, "host" | "compiler">;

export function createSourceDeclarationObservationContext(
  lifecycleContext: SourceDeclarationLifecycleContext,
  compiler: ExtensionCompilerQueryContext,
): ImmediateExtensionObservationContext<"type.resolveRuntimeCarrier"> {
  return {
    observation: "type.resolveRuntimeCarrier",
    phase: "finalization",
    extensionId: "",
    host: lifecycleContext.host,
    facts: lifecycleContext.host.facts,
    factResolver: lifecycleContext.host.factResolver,
    diagnostics: lifecycleContext.host.diagnostics,
    compiler,
  };
}
