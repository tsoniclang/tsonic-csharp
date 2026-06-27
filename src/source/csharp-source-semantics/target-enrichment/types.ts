import type {
  TargetBindingFact,
} from "@tsonic/tsts";

export interface CsharpTargetEnrichmentHost {
  readonly getCsharpTargetBindingByTargetId: (targetId: string) => TargetBindingFact | undefined;
  readonly getCsharpTargetBindingByMetadataName: (metadataName: string) => TargetBindingFact | undefined;
}
