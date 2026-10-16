import type { Node } from "@tsonic/tsts";

export type CsharpNativeParticipation = "erased" | "frame-body" | "body" | "signature";

export interface CsharpNativeParticipationInput {
  readonly participation: { readonly get: (declaration: Node) => CsharpNativeParticipation | undefined };
}
