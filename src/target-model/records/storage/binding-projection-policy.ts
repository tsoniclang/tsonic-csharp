import type { TargetTypeRef } from "../../types/model.js";
import type { Node } from "@tsonic/tsts";
import type { CsharpNativeBindingProperty } from "../objects/value-projections.js";

export interface CsharpBindingProjection {
  readonly storageCarrier: TargetTypeRef;
  readonly bindingCarrier: TargetTypeRef;
  readonly nativeRead?: {
    readonly node: Node;
    readonly receiverCarrier: TargetTypeRef;
    readonly property: CsharpNativeBindingProperty;
  };
}
