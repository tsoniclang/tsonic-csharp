import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../types/model.js";
import type { CsharpExactLiteralRecipe } from "../../conversions/exact-literals.js";

export interface CsharpDictionaryLiteral {
  readonly carrier: TargetTypeRef;
  readonly key: TargetTypeRef;
  readonly value: TargetTypeRef;
  readonly parts: readonly (
    | { readonly kind: "value"; readonly property: Node; readonly key: CsharpExactLiteralRecipe; readonly value: Node }
    | { readonly kind: "spread"; readonly property: Node; readonly expression: Node; readonly copy: boolean }
  )[];
}

export interface CsharpDictionaryLiteralRecords {
  readonly dictionaryLiteral: { readonly get: (node: Node, carrier: TargetTypeRef) => CsharpDictionaryLiteral | undefined };
}
