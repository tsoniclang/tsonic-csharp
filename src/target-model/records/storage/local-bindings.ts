import type { TargetTypeRef } from "../../types/model.js";
import type { Node } from "@tsonic/tsts";

export interface CsharpOptionalLocalPlacement {
  readonly declaration: Node;
  readonly storage: TargetTypeRef;
  readonly payload: TargetTypeRef;
  readonly payloadName: string;
  readonly presenceName: string;
}

export type CsharpOptionalLocalValue =
  | { readonly kind: "absence"; readonly expression: Node | undefined }
  | { readonly kind: "present"; readonly expression: Node }
  | { readonly kind: "copy"; readonly expression: Node; readonly placement: CsharpOptionalLocalPlacement };

export type CsharpOptionalLocalOperation =
  | { readonly kind: "declaration"; readonly placement: CsharpOptionalLocalPlacement; readonly value: CsharpOptionalLocalValue }
  | { readonly kind: "write"; readonly placement: CsharpOptionalLocalPlacement; readonly value: CsharpOptionalLocalValue }
  | { readonly kind: "absence-test"; readonly placement: CsharpOptionalLocalPlacement; readonly negated: boolean;
      readonly other: Node; readonly localFirst: boolean }
  | { readonly kind: "read"; readonly placement: CsharpOptionalLocalPlacement; readonly guarded: boolean }
  | { readonly kind: "coalesce"; readonly placement: CsharpOptionalLocalPlacement; readonly right: Node; readonly assignment: boolean };

export interface CsharpLocalBindingCompletion {
  readonly carrier: TargetTypeRef;
  readonly initialization: "source" | "absence" | "declaration";
  readonly refKind: "ref" | "ref-readonly" | undefined;
  readonly recursiveInitializer: boolean;
  readonly optionalLocal?: CsharpOptionalLocalOperation;
}
