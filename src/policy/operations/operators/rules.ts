import type { CsharpOperationSelection, CsharpResolvedBinaryOperation, CsharpResolvedUnaryOperation, CsharpTargetBinaryOperation } from "../../../target-model/records/operator-selection.js";
import { validateBinaryTargetSemantics, validateUnaryTargetSemantics, isEquality, isRelational, isShift, isBitwise, isArithmetic } from "./operator-validation.js";

import { selectCsharpGuardedIntegerPromotion } from "../numeric/guarded.js";

import { sourceBooleanShortCircuitBranch as csharpBooleanShortCircuitBranch } from "@tsonic/target-api/source";

import { selectCsharpReferenceEquality } from "./reference-equality.js";
import { selectCsharpUnionEquality } from "./union-equality.js";
import { selectCsharpExpressionConversion } from "../../conversions/selection.js";
import { csharpConversionIsApplicable } from "../../conversions/applicability.js";
import type { Node } from "@tsonic/tsts";
import type { CsharpPolicyContext } from "../../model/context.js";
import type { TargetTypeRef } from "../../types/index.js";
import { csharpSourcePrimitiveTargetType, csharpBigIntegerTargetType, getCsharpNullableElementTargetType, getCsharpRuntimeUnionArms, isCsharpIntegralTargetType, isCsharpAbsenceTargetType, isCsharpStringTargetType, isCsharpJsValueTargetType, isCsharpReferenceCarrier, targetTypeRefEquals } from "../../types/index.js";
import { csharpUnaryNumericPromotion, selectCsharpNumericBinaryPromotion } from "../numeric/promotion.js";
import { csharpLiteralIsRepresentableAs } from "../../conversions/literals.js";
import { csharpJsArrayCarrierId } from "../../../target-model/types/carriers/js.js";
import type { CsharpSourceOperator } from "../../../target-model/syntax/operators.js";
import { isCsharpAssignmentOperator } from "../../../target-model/syntax/operators.js";

export interface CsharpBinaryOperands {
  readonly left: Node;
  readonly right: Node;
  readonly sourceOperator: CsharpSourceOperator;
  readonly leftType: TargetTypeRef;
  readonly rightType: TargetTypeRef;
  readonly resultType: TargetTypeRef;
  readonly leftStorage: TargetTypeRef | undefined;
  readonly rightStorage: TargetTypeRef | undefined;
  readonly genericNumeric: Extract<CsharpTargetBinaryOperation, { readonly kind: "generic-numeric" }> | undefined;
  readonly resultUse: ReturnType<CsharpPolicyContext["navigation"]["expressionResultUse"]>;
  readonly assignmentLocation: import("../../../target-model/operations/assignment-locations.js").CsharpAssignmentLocation;
}

export function selectCsharpNativeBinaryOperation(
  input: CsharpPolicyContext,
  facts: CsharpBinaryOperands,
  expectedResultType: TargetTypeRef | undefined,
): CsharpOperationSelection<CsharpResolvedBinaryOperation> {
  const { left, right, sourceOperator, resultType, genericNumeric } = facts;
  let { leftType, rightType } = facts;
  if (genericNumeric !== undefined) return {
    kind: "resolved", sourceOperator, targetOperation: genericNumeric,
    left, right, leftType, rightType, leftInputType: leftType, rightInputType: rightType, resultType,
  };
  if (sourceOperator === ",") return {
    kind: "resolved", sourceOperator, targetOperation: {
      kind: "sequence", resultUse: facts.resultUse,
    },
    left, right, leftType, rightType, leftInputType: leftType, rightInputType: rightType, resultType,
  };
  if (sourceOperator === "&&" || sourceOperator === "||") {
    const boolean = csharpSourcePrimitiveTargetType("bool");
    if (!targetTypeRefEquals(leftType, boolean)) return rejectCsharpOperator("C# conditional-value operators require an exact bool condition.");
    const branch = csharpBooleanShortCircuitBranch(input.ast, left, sourceOperator);
    if (branch !== "left" && !csharpConversionIsApplicable(
      selectCsharpExpressionConversion(input, right, rightType, resultType, "implicit"), "implicit")) {
      return rejectCsharpOperator("C# conditional-value selection requires exact admission of the selected right-hand completion.");
    }
    if (branch !== "right" && !csharpConversionIsApplicable(
      selectCsharpExpressionConversion(input, left, leftType, resultType, "implicit"), "implicit")) {
      return rejectCsharpOperator("C# conditional-value selection requires exact admission of its short-circuit bool result.");
    }
    return { kind: "resolved", sourceOperator,
      targetOperation: { kind: "conditional-value", operator: sourceOperator, branch },
      left, right, leftType, rightType, leftInputType: boolean, rightInputType: resultType, resultType };
  }
  if ((sourceOperator === "??" || sourceOperator === "??=") && isCsharpJsValueTargetType(leftType)) {
    if (!csharpConversionIsApplicable(selectCsharpExpressionConversion(input, right, rightType, leftType, "implicit"), "implicit")) {
      return rejectCsharpOperator("Closed-value coalescing requires an exact native right-hand admission.");
    }
    return {
      kind: "resolved", sourceOperator,
      targetOperation: { kind: "closed-value-coalesce", assignment: sourceOperator === "??=",
        location: facts.assignmentLocation },
      left, right, leftType, rightType, leftInputType: leftType, rightInputType: leftType, resultType: leftType,
    };
  }
  if (isEquality(sourceOperator)) {
    if (isCsharpAbsenceTargetType(rightType)) {
      leftType = selectNullishOperandStorage(facts.leftStorage, leftType, input.typeDefinitions);
    }
    if (isCsharpAbsenceTargetType(leftType)) {
      rightType = selectNullishOperandStorage(facts.rightStorage, rightType, input.typeDefinitions);
    }
    const leftNullable = getCsharpNullableElementTargetType(leftType);
    const rightNullable = getCsharpNullableElementTargetType(rightType);
    const leftArms = getCsharpRuntimeUnionArms(leftNullable ?? leftType, input.typeDefinitions) ?? (leftNullable === undefined ? [] : [leftNullable]);
    const rightArms = getCsharpRuntimeUnionArms(rightNullable ?? rightType, input.typeDefinitions) ?? (rightNullable === undefined ? [] : [rightNullable]);
    const rightCandidates = leftArms?.filter(arm => csharpLiteralIsRepresentableAs(input.literalValues.literalValue.get(right), arm));
    const leftCandidates = rightArms?.filter(arm => csharpLiteralIsRepresentableAs(input.literalValues.literalValue.get(left), arm));
    if (rightCandidates?.length === 1) rightType = rightCandidates[0]!;
    if (leftCandidates?.length === 1) leftType = leftCandidates[0]!;
  }
  const numericPromotion = selectCsharpNumericBinaryPromotion(
    input, left, leftType, right, rightType, expectedResultType,
  ) ?? selectCsharpGuardedIntegerPromotion(input, left, right, leftType, rightType);
  if (numericPromotion === undefined && targetTypeRefEquals(leftType, csharpBigIntegerTargetType()) &&
    targetTypeRefEquals(rightType, csharpBigIntegerTargetType())) {
    const method = bigintRuntimeMethods[sourceOperator];
    if (method !== undefined) {
      return {
        kind: "resolved", sourceOperator,
        targetOperation: { kind: "bigint-call", method, assignment: isCsharpAssignmentOperator(sourceOperator),
          location: facts.assignmentLocation },
        left, right, leftType, rightType, leftInputType: leftType, rightInputType: rightType,
        resultType: leftType,
      };
    }
  }
  if (sourceOperator === "in" && rightType.kind === "target-named" &&
    rightType.id === csharpJsArrayCarrierId &&
    (isCsharpIntegralTargetType(leftType) ||
      targetTypeRefEquals(leftType, csharpSourcePrimitiveTargetType("float64")))) {
    const resultType = csharpSourcePrimitiveTargetType("bool");
    return {
      kind: "resolved", sourceOperator, targetOperation: { kind: "array-index-presence" },
      left, right, leftType, rightType,
      leftInputType: csharpSourcePrimitiveTargetType("float64"), rightInputType: rightType,
      resultType,
    };
  }
  const nullishTest = selectNullishTest(sourceOperator, leftType, rightType, input.typeDefinitions);
  if (nullishTest === undefined && (sourceOperator === "===" || sourceOperator === "!==") &&
    (getCsharpRuntimeUnionArms(getCsharpNullableElementTargetType(leftType) ?? leftType, input.typeDefinitions) !== undefined ||
      getCsharpRuntimeUnionArms(getCsharpNullableElementTargetType(rightType) ?? rightType, input.typeDefinitions) !== undefined)) {
    const arms = selectCsharpUnionEquality(leftType, rightType, input);
    if (arms === undefined) return rejectCsharpOperator("Union equality requires exact native comparison evidence for every leaf pair.");
    const resultType = csharpSourcePrimitiveTargetType("bool");
    return Object.freeze({ kind: "resolved", sourceOperator,
      targetOperation: Object.freeze({ kind: "union-equality", negated: sourceOperator === "!==", arms }),
      left, right, leftType, rightType, leftInputType: leftType, rightInputType: rightType, resultType,
    });
  }
  const stringRelational = selectStringRelational(
    sourceOperator,
    leftType,
    rightType,
  );
  const referenceIdentity = selectCsharpReferenceEquality(
    sourceOperator,
    leftType,
    rightType,
    input,
  );
  const targetOperator = targetBinaryOperator(sourceOperator);
  if (
    nullishTest === undefined &&
    stringRelational === undefined &&
    targetOperator === undefined
  ) {
    return rejectCsharpOperator(
      `Source operator '${sourceOperator}' requires a dedicated C# translation policy.`,
    );
  }
  const numericPromotionRequired = operatorRequiresNumericPromotion(
    sourceOperator,
    leftType,
    rightType,
  );
  if (numericPromotionRequired && numericPromotion === undefined) {
    return rejectCsharpOperator(
      `Source operator '${sourceOperator}' has no exact predefined C# numeric promotion for the selected operand types.`,
    );
  }
  const nullishResultType = sourceOperator === "??" || sourceOperator === "??="
    ? selectNullishResultType(input, leftType, rightType, right)
    : undefined;
  if ((sourceOperator === "??" || sourceOperator === "??=") && nullishResultType === undefined) {
    return rejectCsharpOperator(
      "Source nullish coalescing has no exact C# result relation for the selected target operand types.",
    );
  }
  const coalesceArms = sourceOperator === "??" ? getCsharpRuntimeUnionArms(leftType, input.typeDefinitions) : undefined;
  const coalesceValueArm = coalesceArms?.findIndex(arm => !isCsharpAbsenceTargetType(arm));
  const unionCoalesce: CsharpTargetBinaryOperation | undefined = coalesceValueArm !== undefined && coalesceValueArm >= 0
    ? { kind: "union-coalesce", valueArmIndex: coalesceValueArm, retainCarrier: targetTypeRefEquals(leftType, nullishResultType!) }
    : undefined;
  const operationTypes = selectBinaryOperationTypes(
    sourceOperator,
    leftType,
    rightType,
    resultType,
    numericPromotion,
    nullishResultType,
  );
  const incompatibility = nullishTest === undefined
      && referenceIdentity === undefined
      && unionCoalesce === undefined
    ? validateBinaryTargetSemantics(
        sourceOperator,
        operationTypes.leftInputType,
        operationTypes.rightInputType,
        input,
      )
    : undefined;
  return incompatibility === undefined
    ? {
        kind: "resolved",
        sourceOperator,
        targetOperation: unionCoalesce ?? nullishTest ?? referenceIdentity ?? stringRelational ?? {
          kind: "operator",
          operator: targetOperator!,
        },
        left,
        right,
        leftType,
        rightType,
        ...operationTypes,
      }
    : rejectCsharpOperator(incompatibility);
}

function selectBinaryOperationTypes(
  operator: CsharpSourceOperator,
  leftType: TargetTypeRef,
  rightType: TargetTypeRef,
  selectedResultType: TargetTypeRef,
  numericPromotion: ReturnType<typeof selectCsharpNumericBinaryPromotion>,
  nullishResultType: TargetTypeRef | undefined,
): Pick<
  CsharpResolvedBinaryOperation,
  "leftInputType" | "rightInputType" | "resultType"
> {
  if (operator === "??=" && nullishResultType !== undefined) {
    return { leftInputType: leftType, rightInputType: rightType, resultType: nullishResultType };
  }
  if (isCsharpAssignmentOperator(operator)) {
    return {
      leftInputType: leftType,
      rightInputType: operator === "=" ? leftType : numericPromotion?.rightType ?? rightType,
      resultType: leftType,
    };
  }
  if (isEquality(operator) || isRelational(operator)) {
    return {
      leftInputType: numericPromotion?.leftType ?? leftType,
      rightInputType: numericPromotion?.rightType ?? rightType,
      resultType: csharpSourcePrimitiveTargetType("bool"),
    };
  }
  if (operator === "??" && nullishResultType !== undefined) {
    return {
      leftInputType: leftType,
      rightInputType: nullishResultType,
      resultType: nullishResultType,
    };
  }
  if (isShift(operator)) {
    const promotedLeft = csharpUnaryNumericPromotion(leftType) ?? leftType;
    return {
      leftInputType: promotedLeft,
      rightInputType: rightType,
      resultType: promotedLeft,
    };
  }
  if (numericPromotion !== undefined) {
    return {
      leftInputType: numericPromotion.leftType,
      rightInputType: numericPromotion.rightType,
      resultType: numericPromotion.resultType,
    };
  }
  if (
    operator === "+" &&
    (isCsharpStringTargetType(leftType) || isCsharpStringTargetType(rightType))
  ) {
    return {
      leftInputType: leftType,
      rightInputType: rightType,
      resultType: isCsharpStringTargetType(leftType) ? leftType : rightType,
    };
  }
  return {
    leftInputType: leftType,
    rightInputType: rightType,
    resultType: selectedResultType,
  };
}

function selectNullishOperandStorage(
  storage: TargetTypeRef | undefined,
  selected: TargetTypeRef,
  definitions: CsharpPolicyContext["typeDefinitions"],
): TargetTypeRef {
  return storage !== undefined && (getCsharpNullableElementTargetType(storage) !== undefined ||
    getCsharpRuntimeUnionArms(storage, definitions)?.some(isCsharpAbsenceTargetType)) ? storage : selected;
}

function selectNullishResultType(
  input: CsharpPolicyContext,
  left: TargetTypeRef,
  right: TargetTypeRef,
  rightNode: Node,
): TargetTypeRef | undefined {
  const valueType = nullishValueType(left, input.typeDefinitions);
  if (valueType === undefined) {
    return undefined;
  }
  if (csharpConversionIsApplicable(selectCsharpExpressionConversion(input, rightNode, right, valueType, "implicit"), "implicit")) {
    return valueType;
  }
  if (
    targetTypeRefEquals(right, left) ||
    isCsharpAbsenceTargetType(right)
  ) {
    return left;
  }
  return undefined;
}

function nullishValueType(
  type: TargetTypeRef | undefined,
  definitions?: import("../../../target-model/types/source-union-definitions.js").CsharpTypeDefinitions,
): TargetTypeRef | undefined {
  const nullableElement = getCsharpNullableElementTargetType(type);
  if (nullableElement !== undefined) {
    return nullableElement;
  }
  const runtimeArms = type === undefined
    ? undefined
    : getCsharpRuntimeUnionArms(type, definitions);
  const valueArms = runtimeArms?.filter((arm) =>
    !isCsharpAbsenceTargetType(arm)
  );
  if (valueArms?.length === 1) {
    return valueArms[0];
  }
  return type !== undefined && isCsharpReferenceCarrier(type)
    ? type
    : undefined;
}

function operatorRequiresNumericPromotion(
  operator: CsharpSourceOperator,
  left: TargetTypeRef,
  right: TargetTypeRef,
): boolean {
  if (targetTypeRefEquals(left, csharpBigIntegerTargetType()) && targetTypeRefEquals(right, csharpBigIntegerTargetType())) return false;
  if (
    isCsharpAssignmentOperator(operator) ||
    operator === "&&" ||
    operator === "||" ||
    operator === "??" ||
    isShift(operator) ||
    (
      operator === "+" &&
      (isCsharpStringTargetType(left) || isCsharpStringTargetType(right))
    )
  ) {
    return false;
  }
  return isSourceNumericPrimitive(left) && isSourceNumericPrimitive(right) &&
    (isEquality(operator) || isRelational(operator) || isBitwise(operator) || isArithmetic(operator));
}

const bigintRuntimeMethods: Readonly<Partial<Record<CsharpSourceOperator, "LeftShift" | "RightShift" | "Divide" | "Remainder">>> = {
  "<<": "LeftShift", "<<=": "LeftShift", ">>": "RightShift", ">>=": "RightShift",
  "/": "Divide", "/=": "Divide", "%": "Remainder", "%=": "Remainder",
};

function isSourceNumericPrimitive(type: TargetTypeRef): boolean {
  return type.kind === "source-primitive" && type.name !== "bool";
}

function selectNullishTest(
  operator: CsharpSourceOperator,
  left: TargetTypeRef,
  right: TargetTypeRef,
  definitions?: import("../../../target-model/types/source-union-definitions.js").CsharpTypeDefinitions,
): CsharpTargetBinaryOperation | undefined {
  if (!isEquality(operator)) {
    return undefined;
  }
  const leftNullish = isCsharpAbsenceTargetType(left);
  const rightNullish = isCsharpAbsenceTargetType(right);
  if (leftNullish && rightNullish) {
    const equal = operator === "==" || operator === "!=" || targetTypeRefEquals(left, right);
    return { kind: "nullish-equality", value: operator === "!==" || operator === "!=" ? !equal : equal };
  }
  if (leftNullish === rightNullish) {
    return undefined;
  }
  const testedType = leftNullish ? right : left;
  const unionArms = getCsharpRuntimeUnionArms(testedType, definitions);
  if (unionArms !== undefined) {
    const compared = leftNullish ? left : right;
    const loose = operator === "==" || operator === "!=";
    return {
      kind: "nullish-test", operand: leftNullish ? "right" : "left",
      negated: operator === "!==" || operator === "!=",
      unionArmIndexes: Object.freeze(unionArms.flatMap((arm, index) =>
        targetTypeRefEquals(arm, compared) || loose && (isCsharpAbsenceTargetType(arm)) ? [index] : [])),
    };
  }
  if (getCsharpNullableElementTargetType(testedType) === undefined) {
    return undefined;
  }
  return {
    kind: "nullish-test",
    operand: leftNullish ? "right" : "left",
    negated: operator === "!==" || operator === "!=",
  };
}

function selectStringRelational(
  operator: CsharpSourceOperator,
  left: TargetTypeRef,
  right: TargetTypeRef,
): CsharpTargetBinaryOperation | undefined {
  if (
    (operator !== "<" && operator !== "<=" && operator !== ">" && operator !== ">=") ||
    !isCsharpStringTargetType(left) ||
    !isCsharpStringTargetType(right)
  ) {
    return undefined;
  }
  return {
    kind: "string-ordinal-relational",
    operator,
  };
}

export function targetBinaryOperator(
  source: CsharpSourceOperator,
): string | undefined {
  switch (source) {
    case "===":
    case "==":
      return "==";
    case "!==":
    case "!=":
      return "!=";
    case "<":
    case "<=":
    case ">":
    case ">=":
    case "??":
    case "??=":
    case "&":
    case "|":
    case "^":
    case "<<":
    case ">>":
    case ">>>":
    case "+":
    case "-":
    case "*":
    case "/":
    case "%":
    case "=":
    case "+=":
    case "-=":
    case "*=":
    case "/=":
    case "%=":
    case "&=":
    case "|=":
    case "^=":
    case "<<=":
    case ">>=":
    case ">>>=":
      return source;
    default:
      return undefined;
  }
}

export function rejectCsharpOperator(
  reason: string,
): { readonly kind: "rejected"; readonly reason: string } {
  return { kind: "rejected", reason };
}
export function selectCsharpNativeUnaryOperation(
  input: CsharpPolicyContext,
  sourceOperator: Extract<CsharpSourceOperator, "!" | "~" | "+" | "-" | "++" | "--">,
  operand: Node,
  operandType: TargetTypeRef,
  resultType: TargetTypeRef,
): CsharpOperationSelection<CsharpResolvedUnaryOperation> {
  const incompatibility = validateUnaryTargetSemantics(
    sourceOperator,
    operandType,
    input,
  );
  return incompatibility === undefined
    ? {
        kind: "resolved",
        sourceOperator,
        targetOperator: sourceOperator,
        operand,
        operandType,
        resultType,
      }
    : rejectCsharpOperator(incompatibility);
}

export function csharpBinaryOperationRequiresLocation(
  operator: CsharpSourceOperator,
  left: TargetTypeRef,
  right: TargetTypeRef,
): boolean {
  return (operator === "??" || operator === "??=") && isCsharpJsValueTargetType(left) ||
    targetTypeRefEquals(left, csharpBigIntegerTargetType()) && targetTypeRefEquals(right, csharpBigIntegerTargetType()) &&
    bigintRuntimeMethods[operator] !== undefined;
}
