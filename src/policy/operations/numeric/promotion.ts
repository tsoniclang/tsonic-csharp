import type {
  Node,
  SourcePrimitiveKind,
} from "@tsonic/tsts";
import type {
  CsharpPolicyContext,
} from "../../context.js";
import {
  csharpLiteralIsRepresentableAs,
} from "../../conversions/literals.js";
import type {
  TargetTypeRef,
} from "../../types/index.js";
import {
  csharpSourcePrimitiveTargetType,
} from "../../types/index.js";

export interface CsharpNumericBinaryPromotion {
  readonly leftType: TargetTypeRef;
  readonly rightType: TargetTypeRef;
  readonly resultType: TargetTypeRef;
}

type SourcePrimitiveTargetType = Extract<
  TargetTypeRef,
  { readonly kind: "source-primitive" }
>;

export function selectCsharpNumericBinaryPromotion(
  input: Pick<CsharpPolicyContext, "ast">,
  leftNode: Node,
  leftType: TargetTypeRef,
  rightNode: Node,
  rightType: TargetTypeRef,
  expectedResultType?: TargetTypeRef,
): CsharpNumericBinaryPromotion | undefined {
  if (!isNumericPrimitive(leftType) || !isNumericPrimitive(rightType)) {
    return undefined;
  }
  const selectedLeft = leftType;
  const selectedRight = rightType;
  const expectedPromotion = expectedNumericPromotion(
    input,
    leftNode,
    selectedLeft,
    rightNode,
    selectedRight,
    expectedResultType,
  );
  if (expectedPromotion !== undefined) {
    return expectedPromotion;
  }
  const adaptedRight = literalAdaptation(
    input,
    rightNode,
    selectedRight,
    selectedLeft,
  );
  const adaptedLeft = literalAdaptation(
    input,
    leftNode,
    selectedLeft,
    selectedRight,
  );
  const effectiveLeft = adaptedLeft ?? selectedLeft;
  const effectiveRight = adaptedRight ?? selectedRight;
  const resultKind = promotedPrimitiveKind(
    effectiveLeft.name,
    effectiveRight.name,
  );
  if (resultKind === undefined) {
    return undefined;
  }
  const resultType = csharpSourcePrimitiveTargetType(resultKind);
  return {
    leftType: resultType,
    rightType: resultType,
    resultType,
  };
}

function expectedNumericPromotion(
  input: Pick<CsharpPolicyContext, "ast">,
  leftNode: Node,
  leftType: SourcePrimitiveTargetType,
  rightNode: Node,
  rightType: SourcePrimitiveTargetType,
  expectedResultType: TargetTypeRef | undefined,
): CsharpNumericBinaryPromotion | undefined {
  if (
    !isNumericPrimitive(expectedResultType) ||
    promotedPrimitiveKind(
      expectedResultType.name,
      expectedResultType.name,
    ) !== expectedResultType.name ||
    !operandCanUseExpectedType(input, leftNode, leftType, expectedResultType) ||
    !operandCanUseExpectedType(input, rightNode, rightType, expectedResultType)
  ) {
    return undefined;
  }
  return {
    leftType: expectedResultType,
    rightType: expectedResultType,
    resultType: expectedResultType,
  };
}

function operandCanUseExpectedType(
  input: Pick<CsharpPolicyContext, "ast">,
  node: Node,
  source: SourcePrimitiveTargetType,
  expected: SourcePrimitiveTargetType,
): boolean {
  return source.name === expected.name ||
    csharpLiteralIsRepresentableAs(input, node, expected);
}

export function csharpUnaryNumericPromotion(
  type: TargetTypeRef,
): TargetTypeRef | undefined {
  if (!isNumericPrimitive(type)) {
    return undefined;
  }
  return smallIntegralKinds.has(type.name)
    ? csharpSourcePrimitiveTargetType("int32")
    : type;
}

function literalAdaptation(
  input: Pick<CsharpPolicyContext, "ast">,
  node: Node,
  source: SourcePrimitiveTargetType,
  target: SourcePrimitiveTargetType,
): SourcePrimitiveTargetType | undefined {
  return !targetTypeIsLiteralAdaptationCandidate(target) ||
      source.kind !== "source-primitive" ||
      source.name === target.name ||
      !csharpLiteralIsRepresentableAs(input, node, target)
    ? undefined
    : target;
}

function targetTypeIsLiteralAdaptationCandidate(
  type: TargetTypeRef,
): type is SourcePrimitiveTargetType {
  return isNumericPrimitive(type);
}

function isNumericPrimitive(
  type: TargetTypeRef | undefined,
): type is SourcePrimitiveTargetType {
  return type?.kind === "source-primitive" && type.name !== "bool";
}

function promotedPrimitiveKind(
  left: SourcePrimitiveKind,
  right: SourcePrimitiveKind,
): SourcePrimitiveKind | undefined {
  if (left === right) {
    return smallIntegralKinds.has(left) ? "int32" : left;
  }
  if (nonLanguageNumericKinds.has(left) || nonLanguageNumericKinds.has(right)) {
    return undefined;
  }
  if (left === "decimal" || right === "decimal") {
    const other = left === "decimal" ? right : left;
    return decimalIntegralKinds.has(other) ? "decimal" : undefined;
  }
  if (left === "float64" || right === "float64") {
    return "float64";
  }
  if (left === "float32" || right === "float32") {
    return "float32";
  }
  if (left === "uint64" || right === "uint64") {
    const other = left === "uint64" ? right : left;
    return unsignedLongCompatibleKinds.has(other) ? "uint64" : undefined;
  }
  if (left === "int64" || right === "int64") {
    return "int64";
  }
  if (left === "uint32" || right === "uint32") {
    const other = left === "uint32" ? right : left;
    return signedIntKinds.has(other) ? "int64" : "uint32";
  }
  return standardSmallIntegralKinds.has(left) &&
      standardSmallIntegralKinds.has(right)
    ? "int32"
    : undefined;
}

const smallIntegralKinds = new Set<SourcePrimitiveKind>([
  "char",
  "int8",
  "uint8",
  "int16",
  "uint16",
]);

const standardSmallIntegralKinds = new Set<SourcePrimitiveKind>([
  ...smallIntegralKinds,
  "int32",
  "uint32",
]);

const signedIntKinds = new Set<SourcePrimitiveKind>([
  "int8",
  "int16",
  "int32",
]);

const decimalIntegralKinds = new Set<SourcePrimitiveKind>([
  ...standardSmallIntegralKinds,
  "int64",
  "uint64",
]);

const unsignedLongCompatibleKinds = new Set<SourcePrimitiveKind>([
  "char",
  "uint8",
  "uint16",
  "uint32",
  "uint64",
]);

const nonLanguageNumericKinds = new Set<SourcePrimitiveKind>([
  "float16",
  "native-int",
  "native-uint",
  "int128",
  "uint128",
]);
