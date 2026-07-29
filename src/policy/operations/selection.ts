import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  CsharpTranslationContext,
} from "../../translate/context/index.js";
import type {
  CsharpTargetNamedTypeRef,
  CsharpTypeofRuntimeKind,
  TargetTypeRef,
} from "../types/index.js";
import {
  getCsharpNullableElementTargetType,
  getCsharpTypeofRuntimeKindForTargetType,
  isCsharpAnyRuntimeCarrier,
  isCsharpIntegralTargetType,
  isCsharpRuntimeNullTargetType,
  isCsharpRuntimeUndefinedTargetType,
  isCsharpStringTargetType,
  targetTypeRefEquals,
} from "../types/index.js";
import type {
  CsharpSourceOperator,
} from "./syntax.js";
import {
  sourceOperatorFromKindName,
} from "./syntax.js";

export interface CsharpResolvedBinaryOperation {
  readonly kind: "resolved";
  readonly sourceOperator: CsharpSourceOperator;
  readonly targetOperator: string;
  readonly left: Node;
  readonly right: Node;
  readonly leftType: TargetTypeRef;
  readonly rightType: TargetTypeRef;
  readonly resultType: TargetTypeRef;
}

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

export type CsharpOperationSelection<T> =
  | T
  | { readonly kind: "rejected"; readonly reason: string };

export function selectCsharpBinaryOperation(
  input: CsharpTranslationContext,
  node: Node,
  sourceFile: SourceFile,
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
  const leftType = input.types.resolveNode(left, sourceFile);
  const rightType = input.types.resolveNode(right, sourceFile);
  const resultType = input.types.resolveNode(node, sourceFile);
  if (leftType === undefined || rightType === undefined || resultType === undefined) {
    return rejected(
      "The checked binary expression has no closed C# representation for every operand and result.",
    );
  }
  const targetOperator = targetBinaryOperator(sourceOperator);
  if (targetOperator === undefined) {
    return rejected(
      `Source operator '${sourceOperator}' requires a dedicated C# translation policy.`,
    );
  }
  const incompatibility = validateBinaryTargetSemantics(
    sourceOperator,
    leftType,
    rightType,
    input,
  );
  return incompatibility === undefined
    ? {
        kind: "resolved",
        sourceOperator,
        targetOperator,
        left,
        right,
        leftType,
        rightType,
        resultType,
      }
    : rejected(incompatibility);
}

export function selectCsharpUnaryOperation(
  input: CsharpTranslationContext,
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

export function getCsharpTypeofRuntimeKind(
  type: TargetTypeRef | undefined,
): CsharpTypeofRuntimeKind | undefined {
  const explicit = getCsharpTypeofRuntimeKindForTargetType(type);
  if (explicit !== undefined) {
    return explicit;
  }
  if (type?.kind !== "source-primitive") {
    return undefined;
  }
  if (type.name === "bool") {
    return "boolean";
  }
  if (type.name === "char") {
    return "string";
  }
  return type.name === "int64" ||
    type.name === "uint64" ||
    type.name === "int128" ||
    type.name === "uint128"
    ? "bigint"
    : "number";
}

function validateBinaryTargetSemantics(
  operator: CsharpSourceOperator,
  left: TargetTypeRef,
  right: TargetTypeRef,
  input: CsharpTranslationContext,
): string | undefined {
  if (isCsharpAnyRuntimeCarrier(left) || isCsharpAnyRuntimeCarrier(right)) {
    return `Source operator '${operator}' over opaque any requires an explicit closed compatibility-runtime policy.`;
  }
  if (operator === "=") {
    return undefined;
  }
  if (left.kind === "type-parameter" || right.kind === "type-parameter") {
    return `Source operator '${operator}' over a type parameter requires an exact target constraint policy.`;
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
  if (isEquality(operator)) {
    return supportsIntrinsicEquality(left, right)
      ? undefined
      : `C# equality for '${operator}' is not proven equivalent for the selected target operand types.`;
  }
  if (isRelational(operator)) {
    return isNumeric(left) && isNumeric(right)
      ? undefined
      : `C# relational operator '${operator}' requires numeric source-primitive operands.`;
  }
  if (isShift(operator)) {
    return isCsharpIntegralTargetType(left) &&
        isCsharpIntegralTargetType(right)
      ? undefined
      : `C# shift operator '${operator}' requires integral source-primitive operands.`;
  }
  if (isBitwise(operator)) {
    return (
      isCsharpIntegralTargetType(left) &&
      isCsharpIntegralTargetType(right)
    ) ||
      (isSourceEnum(left) && targetTypeRefEquals(left, right))
      ? undefined
      : `C# bitwise operator '${operator}' requires integral operands or one exact enum type.`;
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
  input: CsharpTranslationContext,
): string | undefined {
  if (isCsharpAnyRuntimeCarrier(operand)) {
    return `Source unary operator '${operator}' over opaque any requires an explicit closed compatibility-runtime policy.`;
  }
  if (operand.kind === "type-parameter") {
    return `Source unary operator '${operator}' over a type parameter requires an exact target constraint policy.`;
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
    return isCsharpIntegralTargetType(operand) || isSourceEnum(operand)
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
  input: CsharpTranslationContext,
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

function isSourceEnum(type: TargetTypeRef): boolean {
  return type.kind === "target-named" &&
    (type as CsharpTargetNamedTypeRef).csharpSourceDeclarationKind === "enum";
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
  return (
    left.kind === "source-primitive" &&
    right.kind === "source-primitive"
  ) || (
    isSourceEnum(left) &&
    targetTypeRefEquals(left, right)
  ) || (
    left.kind === "array" &&
    right.kind === "array" &&
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
