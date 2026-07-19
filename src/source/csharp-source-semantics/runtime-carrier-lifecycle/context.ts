import type {
  ExtensionLifecycleContext,
} from "@tsonic/tsts";

export type RuntimeCarrierLifecycleFactsContext = Pick<ExtensionLifecycleContext, "host" | "compiler">;
