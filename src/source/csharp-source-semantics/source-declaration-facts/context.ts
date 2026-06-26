import type {
  ExtensionObservationContext,
} from "@tsonic/tsts";

export type SourceDeclarationLifecycleContext = {
  readonly host: ExtensionObservationContext["host"];
  readonly compiler?: ExtensionObservationContext["compiler"];
};

export function createSourceDeclarationObservationContext(
  lifecycleContext: SourceDeclarationLifecycleContext,
  compiler: NonNullable<ExtensionObservationContext["compiler"]>,
): ExtensionObservationContext {
  return {
    observation: "type.resolveRuntimeCarrier",
    extensionId: "",
    host: lifecycleContext.host,
    facts: lifecycleContext.host.facts,
    factResolver: lifecycleContext.host.factResolver,
    diagnostics: lifecycleContext.host.diagnostics,
    compiler,
  };
}
