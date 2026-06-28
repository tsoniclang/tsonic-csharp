import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  SourceFile,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  isLiteralRepresentableAsTargetType,
} from "../target-member-selection.js";
import type {
  TargetTypeRefResolutionOptions,
} from "../target-member-selection.js";
import {
  asNodeSubject,
} from "../ast-utils.js";
import {
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
} from "../target-types.js";
import {
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
      return expectedResult ?? unwrapNullableTargetType(left) ?? right ?? left;
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

export function getNullishTargetTypeRefForKnownOperatorOperand(
  expectedOperandType: TargetTypeRef | undefined,
  operand: ExtensionFactSubject | undefined,
  sourceFile: SourceFile | undefined,
  context: ExtensionObservationContext,
): TargetTypeRef | undefined {
  return expectedOperandType !== undefined && isNullishExpressionOperand(operand, sourceFile, context)
    ? expectedOperandType
    : undefined;
}

function isNullishExpressionOperand(
  operand: ExtensionFactSubject | undefined,
  sourceFile: SourceFile | undefined,
  context: ExtensionObservationContext,
): boolean {
  const node = asNodeSubject(operand);
  const compiler = context.compiler;
  if (node === undefined || compiler === undefined) {
    return false;
  }
  const kind = compiler.ast.kindName(node);
  if (kind === "KindNullKeyword" || kind === "KindVoidExpression") {
    return true;
  }
  if (kind !== "KindIdentifier" || compiler.ast.text(node) !== "undefined") {
    return false;
  }
  try {
    const checkedSourceFile = sourceFile ?? compiler.ast.getSourceFile(node);
    const type = compiler.checker.getTypeAtLocation(node, { sourceFile: checkedSourceFile });
    return type === undefined ? false : compiler.typeShape.isNullish(type);
  } catch {
    return false;
  }
}
