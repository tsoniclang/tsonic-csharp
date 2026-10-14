import type { Node } from "@tsonic/tsts";

export type CsharpNativeParticipation = "erased" | "frame-body" | "body" | "signature";

export interface CsharpNativeParticipationClassifications {
  readonly participation: { readonly get: (declaration: Node) => CsharpNativeParticipation | undefined };
}
