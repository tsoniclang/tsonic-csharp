import type {
  ExtensionLifecycleContext,
  TargetTypeRef,
} from "@tsonic/tsts";

export type RuntimeCarrierLifecycleFactsContext = Pick<ExtensionLifecycleContext, "host" | "compiler">;

export type RuntimeCarrierFact = {
  readonly carrier: TargetTypeRef;
};
