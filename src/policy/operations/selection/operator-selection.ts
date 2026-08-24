import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  CsharpPolicyContext,
} from "../../context.js";
import type {
  CsharpTargetNamedTypeRef,
  TargetTypeRef,
} from "../../types/index.js";
import {
  csharpSourcePrimitiveTargetType,
  getCsharpNullableElementTargetType,
  getCsharpRuntimeUnionArms,
  isCsharpJsValueTargetType,
  isCsharpIntegralTargetType,
  isCsharpRuntimeNullTargetType,
  isCsharpRuntimeUndefinedTargetType,
  isCsharpStringTargetType,
  targetTypeRefEquals,
} from "../../types/index.js";
import {
  csharpUnaryNumericPromotion,
  selectCsharpNumericBinaryPromotion,
} from "../numeric/promotion.js";
import {
  csharpLiteralIsRepresentableAs,
} from "../../conversions/literals.js";
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
  const leftType = resolveBinaryOperandType(
    input,
    left,
    targetTypeFor,
  );
  const nullishRightExpectation = sourceOperator === "??"
    ? expectedResultType ?? nullishValueType(leftType)
    : undefined;
  const rightType = resolveBinaryOperandType(
    input,
    right,
    targetTypeFor,
    nullishRightExpectation,
  );
  const selectedResultType = targetTypeFor(node);
  if (leftType === undefined || rightType === undefined || selectedResultType === undefined) {
    return rejected(
      "The checked binary expression has no closed C# representation for every operand and result.",
    );
  }
  const nullishTest = selectNullishTest(sourceOperator, leftType, rightType);
  const stringRelational = selectStringRelational(
    sourceOperator,
    leftType,
    rightType,
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
  const nullishResultType = sourceOperator === "??"
    ? selectNullishResultType(leftType, rightType)
    : undefined;
  if (sourceOperator === "??" && nullishResultType === undefined) {
    return rejected(
      "Source nullish coalescing has no exact C# result relation for the selected target operand types.",
    );
  }
  const operationTypes = selectBinaryOperationTypes(
    sourceOperator,
    leftType,
    rightType,
    selectedResultType,
    numericPromotion,
    nullishResultType,
  );
  const incompatibility = nullishTest === undefined
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
        targetOperation: nullishTest ?? stringRelational ?? {
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
      rightInputType: rightType,
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
  if (targetTypeRefEquals(right, valueType)) {
    return valueType;
  }
  if (
    targetTypeRefEquals(right, left) ||
    isCsharpRuntimeNullTargetType(right) ||
    isCsharpRuntimeUndefinedTargetType(right)
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
    !isCsharpRuntimeNullTargetType(arm) &&
    !isCsharpRuntimeUndefinedTargetType(arm)
  );
  return valueArms?.length === 1 ? valueArms[0] : undefined;
}

function operatorRequiresNumericPromotion(
  operator: CsharpSourceOperator,
  left: TargetTypeRef,
  right: TargetTypeRef,
): boolean {
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
  const leftNullish = isCsharpRuntimeNullTargetType(left) ||
    isCsharpRuntimeUndefinedTargetType(left);
  const rightNullish = isCsharpRuntimeNullTargetType(right) ||
    isCsharpRuntimeUndefinedTargetType(right);
  if (leftNullish === rightNullish) {
    return undefined;
  }
  const testedType = leftNullish ? right : left;
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

function validateBinaryTargetSemantics(
  operator: CsharpSourceOperator,
  left: TargetTypeRef,
  right: TargetTypeRef,
  input: CsharpPolicyContext,
): string | undefined {
  if (operator === "=") {
    return undefined;
  }
  if (isCsharpJsValueTargetType(left) || isCsharpJsValueTargetType(right)) {
    return `Source operator '${operator}' over a dynamic JS value requires an exact closed runtime operation.`;
  }
  if (left.kind === "type-parameter" || right.kind === "type-parameter") {
    return `Source operator '${operator}' over a type parameter requires an exact target constraint policy.`;
  }
  if (isEquality(operator)) {
    if (supportsIntrinsicEquality(left, right, input)) {
      return undefined;
    }
    return isProviderOwned(left, input) || isProviderOwned(right, input)
      ? `Source operator '${operator}' over a provider-owned type requires an exact provider operator relation.`
      : `C# equality for '${operator}' is not proven equivalent for the selected target operand types.`;
  }
  if (isBitwise(operator) && supportsIntrinsicBitwise(left, right, input)) {
    return undefined;
  }
  if (isProviderOwned(left, input) || isProviderOwned(right, input)) {
    return `Source operator '${operator}' over a provider-owned type requires an exact provider operator relation.`;
  }
  if (operator === "&&" || operator === "||" || operator === "&&=" || operator === "||=") {
    return isBoolean(left) && isBoolean(right)
      ? undefined
      : `C# logical operator '${operator}' requires exact bool operands.`;
  }
  if (operator === "??" || operator === "??=") {
    return isNullishCapable(left)
      ? undefined
      : `C# nullish operator '${operator}' requires a nullable or runtime-union left operand.`;
  }
  if (isRelational(operator)) {
    return (
        isNumeric(left) && isNumeric(right)
      ) || (
        isCsharpStringTargetType(left) && isCsharpStringTargetType(right)
      )
      ? undefined
      : `C# relational operator '${operator}' requires numeric source-primitive operands or two exact string operands.`;
  }
  if (isShift(operator)) {
    return isCsharpIntegralTargetType(left) &&
        isCsharpIntegralTargetType(right)
      ? undefined
      : `C# shift operator '${operator}' requires integral source-primitive operands.`;
  }
  if (isBitwise(operator)) {
    return `C# bitwise operator '${operator}' requires integral operands or one exact enum type.`;
  }
  if (isArithmetic(operator)) {
    if (
      (operator === "+" || operator === "+=") &&
      (isCsharpStringTargetType(left) || isCsharpStringTargetType(right))
    ) {
      return undefined;
    }
    return isNumeric(left) && isNumeric(right)
      ? undefined
      : `C# arithmetic operator '${operator}' requires numeric source-primitive operands.`;
  }
  return `Source operator '${operator}' has no intrinsic C# semantic policy.`;
}

function validateUnaryTargetSemantics(
  operator: CsharpResolvedUnaryOperation["sourceOperator"],
  operand: TargetTypeRef,
  input: CsharpPolicyContext,
): string | undefined {
  if (isCsharpJsValueTargetType(operand)) {
    return `Source unary operator '${operator}' over a dynamic JS value requires an exact closed runtime operation.`;
  }
  if (operand.kind === "type-parameter") {
    return `Source unary operator '${operator}' over a type parameter requires an exact target constraint policy.`;
  }
  if (operator === "~" && isCsharpEnumTargetType(operand, input)) {
    return undefined;
  }
  if (isProviderOwned(operand, input)) {
    return `Source unary operator '${operator}' over a provider-owned type requires an exact provider operator relation.`;
  }
  if (operator === "!") {
    return isBoolean(operand)
      ? undefined
      : "C# logical negation requires an exact bool operand.";
  }
  if (operator === "~") {
    return isCsharpIntegralTargetType(operand) ||
        isCsharpEnumTargetType(operand, input)
      ? undefined
      : "C# bitwise complement requires an integral or enum operand.";
  }
  return isNumeric(operand)
    ? undefined
    : `C# unary operator '${operator}' requires a numeric source-primitive operand.`;
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

function isProviderOwned(
  type: TargetTypeRef,
  input: CsharpPolicyContext,
): boolean {
  return type.kind === "target-named" &&
    input.providers.findTargetBindingByTargetId(type.id) !== undefined;
}

function isBoolean(type: TargetTypeRef): boolean {
  return type.kind === "source-primitive" && type.name === "bool";
}

function isNumeric(type: TargetTypeRef): boolean {
  return type.kind === "source-primitive" &&
    type.name !== "bool" &&
    type.name !== "char";
}

function isCsharpEnumTargetType(
  type: TargetTypeRef,
  input: CsharpPolicyContext,
): boolean {
  return type.kind === "target-named" &&
    (
      (type as CsharpTargetNamedTypeRef).csharpSourceDeclarationKind === "enum" ||
      input.providers.findTargetBindingByTargetId(type.id)?.kind === "enum"
    );
}

function isNullishCapable(type: TargetTypeRef): boolean {
  return getCsharpNullableElementTargetType(type) !== undefined ||
    isCsharpRuntimeNullTargetType(type) ||
    isCsharpRuntimeUndefinedTargetType(type) ||
    (
      type.kind === "target-named" &&
      (type as CsharpTargetNamedTypeRef).csharpRuntimeUnionArms !== undefined
    );
}

function supportsIntrinsicEquality(
  left: TargetTypeRef,
  right: TargetTypeRef,
  input: CsharpPolicyContext,
): boolean {
  if (
    isCsharpRuntimeNullTargetType(left) ||
    isCsharpRuntimeUndefinedTargetType(left) ||
    isCsharpRuntimeNullTargetType(right) ||
    isCsharpRuntimeUndefinedTargetType(right)
  ) {
    return true;
  }
  if (isCsharpStringTargetType(left) || isCsharpStringTargetType(right)) {
    return isCsharpStringTargetType(left) && isCsharpStringTargetType(right);
  }
  if (
    runtimeUnionSupportsArmEquality(left, right) ||
    runtimeUnionSupportsArmEquality(right, left)
  ) {
    return true;
  }
  return (
    left.kind === "source-primitive" &&
    right.kind === "source-primitive"
  ) || (
    isCsharpEnumTargetType(left, input) &&
    targetTypeRefEquals(left, right)
  ) || (
    left.kind === "array" &&
    right.kind === "array" &&
    targetTypeRefEquals(left, right)
  ) || (
    targetTypeRefEquals(left, right) &&
    input.projectTypes.catalog.definitionForTarget(left)?.kind === "class"
  );
}

function runtimeUnionSupportsArmEquality(
  union: TargetTypeRef,
  arm: TargetTypeRef,
): boolean {
  return getCsharpRuntimeUnionArms(union)?.some((candidate) =>
    targetTypeRefEquals(candidate, arm)
  ) === true;
}

function supportsIntrinsicBitwise(
  left: TargetTypeRef,
  right: TargetTypeRef,
  input: CsharpPolicyContext,
): boolean {
  return (
    isCsharpIntegralTargetType(left) &&
    isCsharpIntegralTargetType(right)
  ) || (
    isCsharpEnumTargetType(left, input) &&
    targetTypeRefEquals(left, right)
  );
}

function isEquality(operator: CsharpSourceOperator): boolean {
  return operator === "===" ||
    operator === "==" ||
    operator === "!==" ||
    operator === "!=";
}

function isRelational(operator: CsharpSourceOperator): boolean {
  return operator === "<" ||
    operator === "<=" ||
    operator === ">" ||
    operator === ">=";
}

function isShift(operator: CsharpSourceOperator): boolean {
  return operator === "<<" ||
    operator === ">>" ||
    operator === ">>>" ||
    operator === "<<=" ||
    operator === ">>=" ||
    operator === ">>>=";
}

function isBitwise(operator: CsharpSourceOperator): boolean {
  return operator === "&" ||
    operator === "|" ||
    operator === "^" ||
    operator === "&=" ||
    operator === "|=" ||
    operator === "^=";
}

function isArithmetic(operator: CsharpSourceOperator): boolean {
  return operator === "+" ||
    operator === "-" ||
    operator === "*" ||
    operator === "/" ||
    operator === "%" ||
    operator === "+=" ||
    operator === "-=" ||
    operator === "*=" ||
    operator === "/=" ||
    operator === "%=";
}

function rejected(
  reason: string,
): { readonly kind: "rejected"; readonly reason: string } {
  return { kind: "rejected", reason };
}
