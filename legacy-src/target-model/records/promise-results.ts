import type { Node } from "@tsonic/tsts";
import type { SourceExpressionResultDisposition } from "@tsonic/target-api/source";

export type CsharpPromiseDiscard =
  | { readonly kind: "task" }
  | { readonly kind: "optional"; readonly valueType: boolean; readonly present: CsharpPromiseDiscard }
  | { readonly kind: "union"; readonly arms: readonly { readonly index: number; readonly selection: CsharpPromiseDiscard }[] };

export interface CsharpPromiseResult {
  readonly disposition: SourceExpressionResultDisposition;
  readonly discard?: CsharpPromiseDiscard;
}

export type CsharpPromiseResults = ReadonlyMap<Node, CsharpPromiseResult>;
