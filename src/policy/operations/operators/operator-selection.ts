import { validateBinaryTargetSemantics, validateUnaryTargetSemantics, isCsharpReferenceCarrier, isEquality, isRelational, isShift, isBitwise, isArithmetic } from "./operator-validation.js";
import { Node_Expression } from "@tsonic/target-api/source";
import { getCsharpGenericMethodValue } from "../../../target-model/types/generic-method-values.js";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  CsharpPolicyContext,
} from "../../model/context.js";
import type {
  TargetTypeRef,
} from "../../types/index.js";
import {
  csharpSourcePrimitiveTargetType,
  csharpBigIntegerTargetType,
  getCsharpNullableElementTargetType,
  getCsharpRuntimeUnionArms,
  isCsharpIntegralTargetType,
  isCsharpNeverTargetType,
  isCsharpAbsenceTargetType,
  isCsharpStringTargetType,
  isCsharpValueTypeTargetType,
  targetTypeRefEquals,
} from "../../types/index.js";
import {
  csharpUnaryNumericPromotion,
  selectCsharpNumericBinaryPromotion,
} from "../numeric/promotion.js";
import {
  csharpLiteralIsRepresentableAs,
} from "../../conversions/literals.js";
import { csharpJsArrayCarrierId } from "../../types/resolution/surface-types.js";
import {
  sourcePrimitiveImplicitlyConverts,
} from "../../conversions/source-primitives.js";
import type {
  CsharpSourceOperator,
} from "../../../target-model/syntax/operators.js";
import {
  csharpDestructuringAssignmentSyntax,
  isCsharpAssignmentOperator,
  sourceOperatorFromKindName,
} from "../../../target-model/syntax/operators.js";

export interface CsharpResolvedBinaryOperation {
  readonly kind: "resolved";
  readonly sourceOperator: CsharpSourceOperator;
  readonly targetOperation: CsharpTargetBinaryOperation;
  readonly left: Node;
  readonly right: Node;
  readonly leftType: TargetTypeRef;
  readonly rightType: TargetTypeRef;
  readonly leftInputType: TargetTypeRef;
  readonly rightInputType: TargetTypeRef;
  readonly resultType: TargetTypeRef;
  readonly expectedResultCompatible: boolean;
}

export type CsharpTargetBinaryOperation =
  | {
      readonly kind: "bigint-call";
      readonly method: "LeftShift" | "RightShift" | "Divide" | "Remainder";
      readonly assignment: boolean;
      readonly location: "direct" | "reference-receiver" | "unsupported";
    }
  | { readonly kind: "array-index-presence" }
  | { readonly kind: "nullish-equality"; readonly value: boolean }
  | { readonly kind: "union-coalesce"; readonly valueArmIndex: number; readonly retainCarrier: boolean }
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
  | {
      readonly kind: "reference-identity";
      readonly negated: boolean;
      readonly distinctMethodValues?: true;
    };

export interface CsharpResolvedUnaryOperation {
  readonly kind: "resolved";
  readonly sourceOperator: Extract<
    CsharpSourceOperator,
    "!" | "~" | "+" | "-" | "++" | "--"
  >;
  readonly targetOperator: string;
  readonly operand: Node;
  readonly operandType: TargetTypeRef;
  readonly resultType: TargetTypeRef;
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

export type CsharpOperationSelection<T> =
  | T
  | { readonly kind: "rejected"; readonly reason: string };

export type CsharpOperationTargetTypeQuery = (
  node: Node,
) => TargetTypeRef | undefined;

export function selectCsharpBinaryOperation(
  input: CsharpPolicyContext,
  node: Node,
  targetTypeFor: CsharpOperationTargetTypeQuery,
  expectedResultType?: TargetTypeRef,
): CsharpOperationSelection<CsharpResolvedBinaryOperation> {
  if (!input.ast.is.IsBinaryExpression(node)) {
    return rejected("C# binary-operation policy requires a binary expression.");
  }
  const expression = input.ast.as.AsBinaryExpression(node);
  const left = expression?.Left;
  const right = expression?.Right;
  const sourceOperator = sourceOperatorFromKindName(
    input.ast.operatorKindName(node),
  );
  if (left === undefined || right === undefined || sourceOperator === undefined) {
    return rejected(
      "The checked binary expression has incomplete exact AST operator evidence.",
    );
  }
  return selectCsharpBinaryOperands(input, left, right, sourceOperator,
    targetTypeFor(node), targetTypeFor, expectedResultType);
}

export function selectCsharpBinaryOperands(
  input: CsharpPolicyContext,
  left: Node,
  right: Node,
  sourceOperator: CsharpSourceOperator,
  selectedResultType: TargetTypeRef | undefined,
  targetTypeFor: CsharpOperationTargetTypeQuery,
  expectedResultType?: TargetTypeRef,
): CsharpOperationSelection<CsharpResolvedBinaryOperation> {
  let leftType = sourceOperator === "??="
    ? input.types.resolveReadStorage(left)
    : resolveBinaryOperandType(input, left, targetTypeFor);
  const nullishRightExpectation = sourceOperator === "??"
    ? expectedResultType ?? nullishValueType(leftType)
    : sourceOperator === "??=" ? nullishValueType(leftType) : undefined;
  let rightType = resolveBinaryOperandType(
    input,
    right,
    targetTypeFor,
    nullishRightExpectation,
  );
  if (leftType === undefined || rightType === undefined || selectedResultType === undefined) {
    return rejected(
      "The checked binary expression has no closed C# representation for every operand and result.",
    );
  }
  if (isEquality(sourceOperator)) {
    const leftNullable = getCsharpNullableElementTargetType(leftType);
    const rightNullable = getCsharpNullableElementTargetType(rightType);
    const leftArms = getCsharpRuntimeUnionArms(leftType) ?? (leftNullable === undefined ? [] : [leftNullable]);
    const rightArms = getCsharpRuntimeUnionArms(rightType) ?? (rightNullable === undefined ? [] : [rightNullable]);
    const rightCandidates = leftArms?.filter(arm => csharpLiteralIsRepresentableAs(input, right, arm));
    const leftCandidates = rightArms?.filter(arm => csharpLiteralIsRepresentableAs(input, left, arm));
    if (rightCandidates?.length === 1) rightType = rightCandidates[0]!;
    if (leftCandidates?.length === 1) leftType = leftCandidates[0]!;
  }
  if (targetTypeRefEquals(leftType, csharpBigIntegerTargetType()) &&
    targetTypeRefEquals(rightType, csharpBigIntegerTargetType())) {
    const method = bigintRuntimeMethods[sourceOperator];
    if (method !== undefined) {
      let location = left;
      while (input.ast.is.IsParenthesizedExpression(location)) {
        const nested = input.ast.as.AsParenthesizedExpression(location)?.Expression;
        if (nested === undefined) return rejected("BigInt assignment has incomplete location syntax.");
        location = nested;
      }
      const receiver = input.ast.is.IsElementAccessExpression(location) || input.ast.is.IsPropertyAccessExpression(location)
        ? Node_Expression(input.ast, location) : undefined;
      const receiverType = receiver === undefined ? undefined : targetTypeFor(receiver);
      const selectedDeclaration = input.ast.is.IsPropertyAccessExpression(location)
        ? input.semanticsFor(location).operations.propertyAccess(location)?.selectedDeclaration
        : input.ast.is.IsElementAccessExpression(location)
          ? input.semanticsFor(location).operations.elementAccess(location)?.selectedDeclaration
          : undefined;
      const direct = input.ast.is.IsIdentifier(location) ||
        selectedDeclaration !== undefined && input.ast.hasModifierKind(selectedDeclaration, "static");
      return {
        kind: "resolved", sourceOperator,
        targetOperation: { kind: "bigint-call", method, assignment: isCsharpAssignmentOperator(sourceOperator),
          location: direct ? "direct" : receiverType !== undefined && referenceIdentityCarrier(receiverType, input) !== undefined
            ? "reference-receiver" : "unsupported" },
        left, right, leftType, rightType, leftInputType: leftType, rightInputType: rightType,
        resultType: leftType, expectedResultCompatible: expectedResultType !== undefined && targetTypeRefEquals(leftType, expectedResultType),
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
      resultType, expectedResultCompatible: expectedResultType !== undefined && targetTypeRefEquals(resultType, expectedResultType),
    };
  }
  const nullishTest = selectNullishTest(sourceOperator, leftType, rightType);
  const stringRelational = selectStringRelational(
    sourceOperator,
    leftType,
    rightType,
  );
  const referenceIdentity = selectStrictReferenceIdentity(
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
    return rejected(
      `Source operator '${sourceOperator}' requires a dedicated C# translation policy.`,
    );
  }
  const numericPromotion = selectCsharpNumericBinaryPromotion(
    input,
    left,
    leftType,
    right,
    rightType,
    expectedResultType,
  );
  const numericPromotionRequired = operatorRequiresNumericPromotion(
    sourceOperator,
    leftType,
    rightType,
  );
  if (numericPromotionRequired && numericPromotion === undefined) {
    return rejected(
      `Source operator '${sourceOperator}' has no exact predefined C# numeric promotion for the selected operand types.`,
    );
  }
  const nullishResultType = sourceOperator === "??" || sourceOperator === "??="
    ? selectNullishResultType(leftType, rightType)
    : undefined;
  if ((sourceOperator === "??" || sourceOperator === "??=") && nullishResultType === undefined) {
    return rejected(
      "Source nullish coalescing has no exact C# result relation for the selected target operand types.",
    );
  }
  const coalesceArms = sourceOperator === "??" ? getCsharpRuntimeUnionArms(leftType) : undefined;
  const coalesceValueArm = coalesceArms?.findIndex(arm => !isCsharpAbsenceTargetType(arm));
  const unionCoalesce: CsharpTargetBinaryOperation | undefined = coalesceValueArm !== undefined && coalesceValueArm >= 0
    ? { kind: "union-coalesce", valueArmIndex: coalesceValueArm, retainCarrier: targetTypeRefEquals(leftType, nullishResultType!) }
    : undefined;
  const operationTypes = selectBinaryOperationTypes(
    sourceOperator,
    leftType,
    rightType,
    selectedResultType,
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
        expectedResultCompatible: expectedResultType !== undefined &&
          (
            targetTypeRefEquals(operationTypes.resultType, expectedResultType) ||
            sourcePrimitiveImplicitlyConverts(
              expectedResultType,
              operationTypes.resultType,
            )
          ),
      }
    : rejected(incompatibility);
}

function selectStrictReferenceIdentity(
  operator: CsharpSourceOperator,
  left: TargetTypeRef,
  right: TargetTypeRef,
  input: CsharpPolicyContext,
): Extract<CsharpTargetBinaryOperation, { readonly kind: "reference-identity" }> |
    undefined {
  if (operator !== "===" && operator !== "!==" && operator !== "==" && operator !== "!=") {
    return undefined;
  }
  const leftMethod = getCsharpGenericMethodValue(left);
  const rightMethod = getCsharpGenericMethodValue(right);
  if (leftMethod !== undefined && rightMethod !== undefined) {
    return { kind: "reference-identity", negated: operator === "!==" || operator === "!=",
      ...(leftMethod.identity === rightMethod.identity ? {} : { distinctMethodValues: true }) };
  }
  if (operator !== "===" && operator !== "!==") return undefined;
  const leftIdentity = referenceIdentityCarrier(left, input);
  const rightIdentity = referenceIdentityCarrier(right, input);
  return leftIdentity !== undefined && rightIdentity !== undefined &&
      (targetTypeRefEquals(leftIdentity, rightIdentity) ||
        input.objectShapes.resolveTarget(leftIdentity) !== undefined &&
        input.objectShapes.resolveTarget(rightIdentity) !== undefined)
    ? { kind: "reference-identity", negated: operator === "!==" }
    : undefined;
}

function referenceIdentityCarrier(
  type: TargetTypeRef,
  input: CsharpPolicyContext,
): TargetTypeRef | undefined {
  const providerKind = type.kind === "target-named"
    ? input.providers.findTargetBindingByTargetId(type.id)?.kind
    : undefined;
  if (
    isCsharpStringTargetType(type) ||
    isCsharpValueTypeTargetType(type) ||
    providerKind === "enum" ||
    providerKind === "struct"
  ) {
    return undefined;
  }
  const nullableElement = getCsharpNullableElementTargetType(type);
  const carrier = nullableElement !== undefined &&
      !isCsharpValueTypeTargetType(nullableElement)
    ? nullableElement
    : type;
  return carrier.kind === "target-named" || carrier.kind === "array"
    ? carrier
    : undefined;
}

export function selectCsharpDestructuringAssignmentOperation(
  input: CsharpPolicyContext,
  node: Node,
  sourceFile: SourceFile,
): CsharpOperationSelection<CsharpResolvedDestructuringAssignmentOperation> {
  const syntax = csharpDestructuringAssignmentSyntax(input.ast, node);
  if (syntax === undefined) {
    return rejected(
      "C# destructuring-assignment policy requires an array or object binding pattern.",
    );
  }
  const sourceType = input.types.resolveNode(syntax.source, sourceFile);
  const resultType = input.types.resolveNode(node, sourceFile);
  if (
    sourceType === undefined ||
    resultType === undefined ||
    !targetTypeRefEquals(sourceType, resultType)
  ) {
    return rejected(
      "The checked destructuring assignment requires one exact C# representation for its source and result value.",
    );
  }
  return {
    kind: "resolved",
    sourceOperator: "=",
    targetOperation: { kind: "operator", operator: "=" },
    pattern: syntax.pattern,
    source: syntax.source,
    sourceType,
    resultType,
  };
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
      rightInputType: operator === "=" ? leftType : rightType,
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
  if (operator === "&&" || operator === "||") {
    return {
      leftInputType: leftType,
      rightInputType: rightType,
      resultType: csharpSourcePrimitiveTargetType("bool"),
    };
  }
  if (operator === "??" && nullishResultType !== undefined) {
    return {
      leftInputType: leftType,
      rightInputType: isCsharpNeverTargetType(rightType) ? nullishResultType : rightType,
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

function resolveBinaryOperandType(
  input: CsharpPolicyContext,
  node: Node,
  targetTypeFor: CsharpOperationTargetTypeQuery,
  expectedType?: TargetTypeRef,
): TargetTypeRef | undefined {
  if (input.ast.is.IsBinaryExpression(node)) {
    const nested = selectCsharpBinaryOperation(
      input,
      node,
      targetTypeFor,
      expectedType,
    );
    if (nested.kind === "resolved") {
      return nested.resultType;
    }
  }
  const selected = targetTypeFor(node);
  if (isCsharpAbsenceTargetType(selected)) {
    const storage = input.types.resolveReadStorage(node);
    if (getCsharpNullableElementTargetType(storage) !== undefined) return storage;
  }
  if (expectedType !== undefined && input.ast.is.IsObjectLiteralExpression(node)) {
    const shape = input.objectShapes.resolveTarget(expectedType);
    const construction = shape === undefined ? undefined
      : input.objectShapes.resolveObjectLiteralTargetShape(shape, node, input.semanticsFor(node).sourceFile);
    if (construction?.kind === "resolved") return expectedType;
  }
  return adaptLiteralToExpectedType(input, node, selected, expectedType);
}

function adaptLiteralToExpectedType(
  input: CsharpPolicyContext,
  node: Node,
  selected: TargetTypeRef | undefined,
  expected: TargetTypeRef | undefined,
): TargetTypeRef | undefined {
  return selected !== undefined &&
      expected !== undefined &&
      csharpLiteralIsRepresentableAs(input, node, expected)
    ? expected
    : selected;
}

function selectNullishResultType(
  left: TargetTypeRef,
  right: TargetTypeRef,
): TargetTypeRef | undefined {
  const valueType = nullishValueType(left);
  if (valueType === undefined) {
    return undefined;
  }
  if (isCsharpNeverTargetType(right) || targetTypeRefEquals(right, valueType)) {
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
): TargetTypeRef | undefined {
  const nullableElement = getCsharpNullableElementTargetType(type);
  if (nullableElement !== undefined) {
    return nullableElement;
  }
  const runtimeArms = type === undefined
    ? undefined
    : getCsharpRuntimeUnionArms(type);
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
  const unionArms = getCsharpRuntimeUnionArms(testedType);
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

export function selectCsharpUnaryOperation(
  input: CsharpPolicyContext,
  node: Node,
  sourceFile: SourceFile,
): CsharpOperationSelection<CsharpResolvedUnaryOperation> {
  const prefix = input.ast.is.IsPrefixUnaryExpression(node);
  const postfix = input.ast.is.IsPostfixUnaryExpression(node);
  if (!prefix && !postfix) {
    return rejected("C# unary-operation policy requires an update expression.");
  }
  const operand = prefix
    ? input.ast.as.AsPrefixUnaryExpression(node)?.Operand
    : input.ast.as.AsPostfixUnaryExpression(node)?.Operand;
  const sourceOperator = sourceOperatorFromKindName(
    input.ast.operatorKindName(node),
  );
  if (
    operand === undefined ||
    (
      sourceOperator !== "!" &&
      sourceOperator !== "~" &&
      sourceOperator !== "+" &&
      sourceOperator !== "-" &&
      sourceOperator !== "++" &&
      sourceOperator !== "--"
    )
  ) {
    return rejected(
      "The checked update expression has incomplete exact AST operator evidence.",
    );
  }
  const operandType = input.types.resolveNode(operand, sourceFile);
  const resultType = input.types.resolveNode(node, sourceFile);
  if (operandType === undefined || resultType === undefined) {
    return rejected(
      "The checked update expression has no closed C# representation for its operand and result.",
    );
  }
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
    : rejected(incompatibility);
}

function targetBinaryOperator(
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
    case "&&":
    case "||":
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

function rejected(
  reason: string,
): { readonly kind: "rejected"; readonly reason: string } {
  return { kind: "rejected", reason };
}
