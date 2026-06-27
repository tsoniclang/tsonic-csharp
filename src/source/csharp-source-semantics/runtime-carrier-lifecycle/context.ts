import type {
  ExtensionObservationContext,
  TargetTypeRef,
} from "@tsonic/tsts";

export type RuntimeCarrierLifecycleFactsContext = {
  readonly host: ExtensionObservationContext["host"];
  readonly compiler?: ExtensionObservationContext["compiler"];
};

export type RuntimeCarrierFact = {
  readonly carrier: TargetTypeRef;
};
