import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../types/native-type-data.js";

export interface CsharpReturnContext {
  readonly target: TargetTypeRef;
}

export interface CsharpReturnContextIndex {
  readonly returnContext: { readonly get: (callable: Node) => CsharpReturnContext | undefined };
}
