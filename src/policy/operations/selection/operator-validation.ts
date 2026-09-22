import type { CsharpPolicyContext } from "../../model/context.js";
import type { CsharpTargetNamedTypeRef, TargetTypeRef } from "../../types/index.js";
import { csharpBigIntegerTargetType, getCsharpNullableElementTargetType, getCsharpRuntimeUnionArms, isCsharpJsValueTargetType, isCsharpIntegralTargetType, isCsharpRuntimeNullTargetType, isCsharpRuntimeUndefinedTargetType, isCsharpStringTargetType, isCsharpValueTypeTargetType, isCsharpVoidTargetType, targetTypeRefEquals } from "../../types/index.js";
import type { CsharpSourceOperator } from "../../../target-model/syntax/operators.js";

export function validateBinaryTargetSemantics(
  operator: CsharpSourceOperator,
  left: TargetTypeRef,
  right: TargetTypeRef,
  input: CsharpPolicyContext,
): string | undefined {
  if (operator === "=") {
    return undefined;
  }
  if (targetTypeRefEquals(left, csharpBigIntegerTargetType()) && targetTypeRefEquals(right, csharpBigIntegerTargetType()) &&
    (isEquality(operator) || isRelational(operator) || isArithmetic(operator) || isBitwise(operator))) return undefined;
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
  if (operator === "??=") {
    return getCsharpNullableElementTargetType(left) !== undefined || isCsharpReferenceCarrier(left)
      ? undefined
      : "C# nullish assignment requires exact native nullable or reference storage.";
  }
  if (operator === "??") {
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

export function validateUnaryTargetSemantics(
  operator: Extract<CsharpSourceOperator, "!" | "~" | "+" | "-" | "++" | "--">,
  operand: TargetTypeRef,
  input: CsharpPolicyContext,
): string | undefined {
  if ((operator === "-" || operator === "~" || operator === "++" || operator === "--") && targetTypeRefEquals(operand, csharpBigIntegerTargetType())) {
    return undefined;
  }
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
    isCsharpReferenceCarrier(type) ||
    (
      type.kind === "target-named" &&
      (type as CsharpTargetNamedTypeRef).csharpRuntimeUnionArms !== undefined
    );
}

export function isCsharpReferenceCarrier(type: TargetTypeRef): boolean {
  return type.kind === "array" ||
    type.kind === "target-named" &&
      !isCsharpValueTypeTargetType(type) &&
      !isCsharpVoidTargetType(type);
}

function supportsIntrinsicEquality(
  left: TargetTypeRef,
  right: TargetTypeRef,
  input: CsharpPolicyContext,
): boolean {
  const leftElement = getCsharpNullableElementTargetType(left);
  const rightElement = getCsharpNullableElementTargetType(right);
  if (leftElement !== undefined && rightElement === undefined) {
    return supportsIntrinsicEquality(leftElement, right, input);
  }
  if (rightElement !== undefined && leftElement === undefined) {
    return supportsIntrinsicEquality(left, rightElement, input);
  }
  if (targetTypeRefEquals(left, csharpBigIntegerTargetType()) &&
    targetTypeRefEquals(right, csharpBigIntegerTargetType())) {
    return true;
  }
  if (
    isCsharpRuntimeNullTargetType(left) ||
    isCsharpRuntimeUndefinedTargetType(left) ||
    isCsharpRuntimeNullTargetType(right) ||
    isCsharpRuntimeUndefinedTargetType(right)
  ) {
    return true;
  }
  if (
    runtimeUnionSupportsArmEquality(left, right) ||
    runtimeUnionSupportsArmEquality(right, left)
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

export function isEquality(operator: CsharpSourceOperator): boolean {
  return operator === "===" ||
    operator === "==" ||
    operator === "!==" ||
    operator === "!=";
}

export function isRelational(operator: CsharpSourceOperator): boolean {
  return operator === "<" ||
    operator === "<=" ||
    operator === ">" ||
    operator === ">=";
}

export function isShift(operator: CsharpSourceOperator): boolean {
  return operator === "<<" ||
    operator === ">>" ||
    operator === ">>>" ||
    operator === "<<=" ||
    operator === ">>=" ||
    operator === ">>>=";
}

export function isBitwise(operator: CsharpSourceOperator): boolean {
  return operator === "&" ||
    operator === "|" ||
    operator === "^" ||
    operator === "&=" ||
    operator === "|=" ||
    operator === "^=";
}

export function isArithmetic(operator: CsharpSourceOperator): boolean {
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
