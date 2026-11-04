import type { TargetTypeRef } from "../../types/model.js";
import type { Node } from "@tsonic/tsts";

export interface CsharpOptionalLocalPlacementSource {
  readonly declaration: Node;
  readonly storage: TargetTypeRef;
  readonly payload: TargetTypeRef;
  readonly payloadName: string;
}

export interface CsharpOptionalLocalPlacement extends CsharpOptionalLocalPlacementSource {
  readonly presenceName: string;
}

export type CsharpOptionalLocalValue<Placement extends CsharpOptionalLocalPlacementSource = CsharpOptionalLocalPlacement> =
  | { readonly kind: "absence"; readonly expression: Node | undefined }
  | { readonly kind: "present"; readonly expression: Node }
  | { readonly kind: "copy"; readonly expression: Node; readonly placement: Placement };

export type CsharpOptionalLocalOperation<Placement extends CsharpOptionalLocalPlacementSource = CsharpOptionalLocalPlacement> =
  | { readonly kind: "declaration"; readonly placement: Placement; readonly value: CsharpOptionalLocalValue<Placement> }
  | { readonly kind: "write"; readonly placement: Placement; readonly value: CsharpOptionalLocalValue<Placement> }
  | { readonly kind: "absence-test"; readonly placement: Placement; readonly negated: boolean;
      readonly other: Node; readonly localFirst: boolean }
  | { readonly kind: "read"; readonly placement: Placement; readonly guarded: boolean }
  | { readonly kind: "coalesce"; readonly placement: Placement; readonly right: Node; readonly assignment: boolean };

export interface CsharpLocalBindingCompletion {
  readonly carrier: TargetTypeRef;
  readonly initialization: "source" | "absence" | "declaration";
  readonly refKind: "ref" | "ref-readonly" | undefined;
  readonly recursiveInitializer: boolean;
  readonly optionalLocal?: CsharpOptionalLocalOperation;
}
