import type { TargetTypeRef } from "../../types/model.js";
import type { Node } from "@tsonic/tsts";
import type { CsharpNativePropertyRead } from "../program/source-profile-invocations.js";

export interface CsharpBindingProjection {
  readonly storageCarrier: TargetTypeRef;
  readonly bindingCarrier: TargetTypeRef;
  readonly nativeRead?: {
    readonly node: Node;
    readonly receiverCarrier: TargetTypeRef;
    readonly property: CsharpNativePropertyRead;
  };
}
