import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../types/model.js";
import type { CsharpConversionSelection } from "../conversions/selection.js";

export interface CsharpOptionalCallStep {
  readonly node: Node;
  readonly expression: Node;
  readonly callee: Node | undefined;
  readonly type: TargetTypeRef;
  readonly storage: TargetTypeRef;
  readonly guard: boolean;
  readonly argument: { readonly type: TargetTypeRef; readonly conversion: CsharpConversionSelection } | undefined;
}

export type CsharpOptionalCallChain =
  | { readonly kind: "direct" }
  | { readonly kind: "guarded"; readonly receiver: Node; readonly result: TargetTypeRef; readonly steps: readonly CsharpOptionalCallStep[] };

export interface CsharpOptionalCallChainRecords {
  readonly optionalCallChain: { readonly get: (node: Node) => CsharpOptionalCallChain | undefined };
}
