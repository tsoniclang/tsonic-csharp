import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../types/model.js";
import type { CsharpNativeBindingProperty } from "../objects/value-projections.js";

interface CsharpBindingProjectionCarriers {
  readonly storageCarrier: TargetTypeRef;
  readonly bindingCarrier: TargetTypeRef;
}

export type CsharpBindingProjection = CsharpBindingProjectionCarriers & (
  | { readonly kind: "value" }
  | { readonly kind: "native-member"; readonly node: Node; readonly receiverCarrier: TargetTypeRef;
      readonly property: CsharpNativeBindingProperty }
);
