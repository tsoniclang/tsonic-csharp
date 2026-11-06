import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../types/model.js";
import type { CsharpUnionEqualityArm } from "../../operations/binary.js";
import type { CsharpExactLiteralRecipe } from "../../conversions/exact-literals.js";

export type CsharpUnionEqualityOperand = {
  readonly arm: CsharpUnionEqualityArm["left"];
  readonly form: "absence" | "present" | "union";
} | {
  readonly arm: CsharpUnionEqualityArm["left"];
  readonly form: "literal";
  readonly literal: CsharpExactLiteralRecipe;
};
export interface CsharpUnionEqualityEmission {
  readonly left: Node;
  readonly right: Node;
  readonly leftType: TargetTypeRef;
  readonly rightType: TargetTypeRef;
  readonly result: TargetTypeRef;
  readonly negated: boolean;
  readonly arms: readonly {
    readonly left: CsharpUnionEqualityOperand;
    readonly right: CsharpUnionEqualityOperand;
    readonly operation: CsharpUnionEqualityArm["operation"];
    readonly castLeft: boolean;
    readonly castRight: boolean;
  }[];
}
export interface CsharpUnionEqualityRecords {
  readonly unionEquality: { readonly get: (node: Node) => CsharpUnionEqualityEmission | undefined };
}
