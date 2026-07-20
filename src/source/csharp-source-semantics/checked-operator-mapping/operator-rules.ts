import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  SourcePrimitiveKind,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  isLiteralRepresentableAsTargetType,
} from "../target-member-selection.js";
import type {
  TargetTypeRefResolutionOptions,
} from "../target-member-selection.js";
import {
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
} from "../target-types.js";
import {
  isCsharpStringType,
  unwrapNullableTargetType,
} from "../target-rules.js";
import {
  type CsharpProviderConversionOperatorHost,
  isCsharpProviderOwnedTargetType,
} from "../provider-conversion-operators.js";

export function getCsharpOperatorResultTypeRefForOperator(
  operator: string,
  left: TargetTypeRef,
  right: TargetTypeRef | undefined,
  expectedResult?: TargetTypeRef,
): TargetTypeRef {
  switch (operator) {
    case "===":
    case "==":
    case "!==":
    case "!=":
    case "<":
    case "<=":
    case ">":
    case ">=":
    case "&&":
    case "||":
      return csharpSourcePrimitiveTargetType("bool");
    case "typeof":
      return csharpStringTargetType();
    case "??":
      return unwrapNullableTargetType(left) ?? expectedResult ?? right ?? left;
    case "+":
      if (isCsharpStringType(left) || isCsharpStringType(right)) {
        return csharpStringTargetType();
      }
      return getPromotedSourcePrimitiveArithmeticType(left, right) ?? left;
    case "-":
    case "*":
    case "/":
    case "%":
      return getPromotedSourcePrimitiveArithmeticType(left, right) ?? left;
    default:
      return left;
  }
}

export function getCheckedOperatorOperandQuery(_operator: string): TargetTypeRefResolutionOptions {
  return {};
}

export function operatorRequiresSelectedProviderIdentity(
  operator: string,
  left: TargetTypeRef | undefined,
  right: TargetTypeRef | undefined,
  host: CsharpProviderConversionOperatorHost,
): boolean {
  if (operator === "=") {
    return false;
  }
  return isCsharpProviderOwnedTargetType(left, host) || isCsharpProviderOwnedTargetType(right, host);
}

export function getLiteralTargetTypeRefForKnownOperatorOperand(
  expectedOperandType: TargetTypeRef | undefined,
  operand: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): TargetTypeRef | undefined {
  const unwrappedExpected = unwrapNullableTargetType(expectedOperandType);
  return unwrappedExpected !== undefined && isLiteralRepresentableAsTargetType(unwrappedExpected, operand, context)
    ? unwrappedExpected
    : undefined;
}

function getPromotedSourcePrimitiveArithmeticType(left: TargetTypeRef, right: TargetTypeRef | undefined): TargetTypeRef | undefined {
  const leftKind = getSourcePrimitiveNumericKind(left);
  const rightKind = getSourcePrimitiveNumericKind(right);
  if (leftKind === undefined || rightKind === undefined) {
    return undefined;
  }
  return csharpSourcePrimitiveTargetType(getPromotedSourcePrimitiveNumericKind(leftKind, rightKind));
}

function getSourcePrimitiveNumericKind(type: TargetTypeRef | undefined): SourcePrimitiveKind | undefined {
  if (type?.kind !== "source-primitive") {
    return undefined;
  }
  switch (type.name) {
    case "int8":
    case "uint8":
    case "int16":
    case "uint16":
    case "int32":
    case "uint32":
    case "int64":
    case "uint64":
    case "native-int":
    case "native-uint":
    case "int128":
    case "uint128":
    case "float16":
    case "float32":
    case "float64":
    case "decimal":
      return type.name;
    default:
      return undefined;
  }
}

function getPromotedSourcePrimitiveNumericKind(left: SourcePrimitiveKind, right: SourcePrimitiveKind): SourcePrimitiveKind {
  const leftRank = sourcePrimitiveNumericPromotionRank(left);
  const rightRank = sourcePrimitiveNumericPromotionRank(right);
  return leftRank.rank >= rightRank.rank ? leftRank.kind : rightRank.kind;
}

function sourcePrimitiveNumericPromotionRank(kind: SourcePrimitiveKind): { readonly kind: SourcePrimitiveKind; readonly rank: number } {
  switch (kind) {
    case "float64":
      return { kind, rank: 90 };
    case "float32":
      return { kind, rank: 80 };
    case "float16":
      return { kind, rank: 70 };
    case "decimal":
      return { kind, rank: 60 };
    case "int128":
    case "uint128":
      return { kind, rank: 50 };
    case "int64":
    case "uint64":
      return { kind, rank: 40 };
    case "native-int":
    case "native-uint":
      return { kind, rank: 35 };
    case "int32":
    case "uint32":
      return { kind, rank: 30 };
    case "int16":
    case "uint16":
      return { kind: "int32", rank: 30 };
    case "int8":
    case "uint8":
      return { kind: "int32", rank: 30 };
    default:
      return { kind, rank: 0 };
  }
}
