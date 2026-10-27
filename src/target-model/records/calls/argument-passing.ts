import type { ArgumentPassingMode, Node } from "@tsonic/tsts";
import type { CsharpTargetParameter, TargetTypeRef } from "../../types/model.js";
import type { CsharpNativeLocationSelection } from "../native/native-locations.js";

export interface CsharpNativeArgumentRequest {
  readonly node: Node;
  readonly target: TargetTypeRef;
  readonly passing: CsharpTargetParameter["passingMode"];
  readonly parameter: CsharpTargetParameter | undefined;
}
export interface CsharpArgumentPassing {
  readonly expression: Node;
  readonly mode: ArgumentPassingMode;
  readonly passing: "in" | "out" | "ref" | undefined;
  readonly location: Extract<CsharpNativeLocationSelection, { readonly kind: "resolved" }> | undefined;
  readonly suspends: boolean;
}
export interface CsharpArgumentPassingRecords {
  readonly argumentPassing: { readonly get: (node: Node) => CsharpArgumentPassing | undefined };
  readonly argumentProjection: { readonly get: (node: Node, parameter: CsharpTargetParameter) => boolean | undefined };
}
