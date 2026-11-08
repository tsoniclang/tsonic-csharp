import type { CsharpAssignmentLocation } from "../../operations/assignment-locations.js";
import type { CsharpReferenceEquality, CsharpUnionEqualityArm } from "../../operations/binary.js";
import type { CsharpSourceOperator } from "../../syntax/operators.js";
import type { TargetTypeRef } from "../../types/native-type-data.js";
import type { SourceRefusal } from "@tsonic/target-api/source";
import type { Node } from "@tsonic/tsts";

export type CsharpOperationSelection<T> =
  | T
  | { readonly kind: "source-refused"; readonly refusal: SourceRefusal }
  | import("../../types/representation.js").CsharpNativeRepresentationRefusal
  | { readonly kind: "rejected"; readonly reason: string };

export interface CsharpResolvedBinaryOperation {
  readonly kind: "resolved";
  readonly sourceOperator: CsharpSourceOperator;
  readonly targetOperation: CsharpTargetBinaryOperation;
  readonly left: Node;
  readonly right: Node | undefined;
  readonly leftType: TargetTypeRef;
  readonly rightType: TargetTypeRef | undefined;
  readonly leftInputType: TargetTypeRef;
  readonly rightInputType: TargetTypeRef | undefined;
  readonly resultType: TargetTypeRef;
  readonly compound?: {
    readonly storage: Node;
    readonly readType: TargetTypeRef;
    readonly storageType: TargetTypeRef;
    readonly calculation: CsharpResolvedBinaryOperation;
  };
}

export interface CsharpResolvedDestructuringAssignmentOperation {
  readonly kind: "resolved";
  readonly sourceOperator: "=";
  readonly targetOperation: {
    readonly kind: "operator";
    readonly operator: "=";
  };
  readonly pattern: Node;
  readonly source: Node;
  readonly sourceType: TargetTypeRef;
  readonly resultType: TargetTypeRef;
}

export type CsharpResolvedUnaryOperation = CsharpNativeUnaryOperation | {
  readonly kind: "literal";
  readonly sourceOperator: "+" | "-";
  readonly resultType: TargetTypeRef;
  readonly recipe: import("../../conversions/exact-literals.js").CsharpExactLiteralRecipe;
};

export interface CsharpNativeUnaryOperation {
  readonly kind: "resolved";
  readonly sourceOperator: Extract<
    CsharpSourceOperator,
    "!" | "~" | "+" | "-" | "++" | "--"
  >;
  readonly targetOperator: string;
  readonly operand: Node;
  readonly form: "prefix" | "postfix";
  readonly operandSourceType: TargetTypeRef;
  readonly storageType?: TargetTypeRef;
  readonly operandType: TargetTypeRef;
  readonly operandConversionMode: import("../../conversions/selection.js").CsharpConversionMode;
  readonly resultType: TargetTypeRef;
}

export type CsharpTargetBinaryOperation =
  | NonNullable<{
    readonly kind: "generic-numeric";
    readonly operator: string;
    readonly carrier: TargetTypeRef;
    readonly zeroOperand?: "left" | "right";
} | undefined>
  | { readonly kind: "sequence"; readonly resultUse: "consumed" | "discarded";
      readonly operands: readonly { readonly occurrence: Node; readonly carrier: TargetTypeRef }[] }
  | { readonly kind: "conditional-value"; readonly operator: "&&" | "||" | "??"; readonly branch: "left" | "right" | "dynamic" }
  | {
      readonly kind: "bigint-call";
      readonly method: "LeftShift" | "RightShift" | "Divide" | "Remainder";
      readonly assignment: boolean;
      readonly location: CsharpAssignmentLocation;
    }
  | { readonly kind: "closed-value-coalesce"; readonly assignment: boolean; readonly location: CsharpAssignmentLocation }
  | { readonly kind: "array-index-presence" }
  | { readonly kind: "nullish-equality"; readonly value: boolean }
  | { readonly kind: "union-coalesce"; readonly valueArmIndex: number; readonly retainCarrier: boolean }
  | { readonly kind: "union-equality"; readonly negated: boolean; readonly arms: readonly CsharpUnionEqualityArm[] }
  | {
      readonly kind: "operator";
      readonly operator: string;
    }
  | {
      readonly kind: "string-ordinal-relational";
      readonly operator: Extract<CsharpSourceOperator, "<" | "<=" | ">" | ">=">;
    }
  | {
      readonly kind: "nullish-test";
      readonly operand: "left" | "right";
      readonly negated: boolean;
      readonly unionArmIndexes?: readonly number[];
    }
  | CsharpReferenceEquality;
