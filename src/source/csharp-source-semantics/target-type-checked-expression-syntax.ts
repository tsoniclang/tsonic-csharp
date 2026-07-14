import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  Node,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  asNodeSubject,
  getNodeField,
} from "./ast-utils.js";
import {
  getLiteralTargetTypeRefForKnownOperatorOperand,
} from "./checked-operator-mapping/index.js";
import {
  getBinaryOperatorText,
  getPrefixUnaryOperatorText,
} from "./operator-syntax.js";
import type {
  TargetTypeRefResolutionOptions,
} from "./target-member-selection.js";
import {
  isCsharpBitwiseOperator,
  isIntegralTargetTypeRef,
  unwrapNullableTargetType,
} from "./target-rules.js";
import {
  targetTypeRefEquals,
} from "./target-ref-utils.js";
import {
  csharpBigIntegerTargetType,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
} from "./target-types.js";
import type {
  CsharpTargetTypeResolutionHost,
} from "./target-type-resolution.js";
import type {
  CsharpRecursiveTargetTypeResolver,
} from "./target-type-syntax-types.js";

export function getTargetTypeRefFromCheckedExpressionSyntax(
  subject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
  options: TargetTypeRefResolutionOptions,
  host: CsharpTargetTypeResolutionHost,
  resolver: CsharpRecursiveTargetTypeResolver,
): TargetTypeRef | undefined {
  const ast = context.compiler?.ast;
  const node = asNodeSubject(subject);
  if (ast === undefined || node === undefined) {
    return undefined;
  }
  const literal = getTargetTypeRefFromLiteralSyntax(node, context);
  if (literal !== undefined) {
    return literal;
  }
  if (ast.is.IsParenthesizedExpression(node)) {
    return resolver.resolveSubject(asNodeSubject(getNodeField(node, "Expression")), context, {
      ...options,
      allowSemanticTypeQuery: false,
    }, host);
  }
  if (ast.is.IsConditionalExpression(node)) {
    const whenTrue = resolver.resolveSubject(asNodeSubject(getNodeField(node, "WhenTrue")), context, {
      ...options,
      allowSemanticTypeQuery: false,
    }, host);
    const whenFalse = resolver.resolveSubject(asNodeSubject(getNodeField(node, "WhenFalse")), context, {
      ...options,
      allowSemanticTypeQuery: false,
    }, host);
    return whenTrue !== undefined && whenFalse !== undefined && targetTypeRefEquals(whenTrue, whenFalse)
      ? whenTrue
      : undefined;
  }
  if (ast.kindName(node) === "KindPrefixUnaryExpression") {
    const operator = getPrefixUnaryOperatorText(ast, node);
    const operandType = resolver.resolveSubject(asNodeSubject(getNodeField(node, "Operand")), context, {
      ...options,
      allowSemanticTypeQuery: false,
    }, host);
    if (operator === "!") {
      return csharpSourcePrimitiveTargetType("bool");
    }
    if (operator === "~") {
      return isIntegralTargetTypeRef(operandType) ? operandType : undefined;
    }
    return operandType;
  }
  if (!ast.is.IsBinaryExpression(node)) {
    return undefined;
  }
  const operator = getBinaryOperatorText(ast, node);
  if (operator === undefined) {
    return undefined;
  }
  const operandOptions = operator === "??"
    ? {
        ...options,
        allowSemanticTypeQuery: true,
      }
    : {
        ...options,
        allowSemanticTypeQuery: false,
      };
  const left = resolver.resolveSubject(asNodeSubject(getNodeField(node, "Left")), context, {
    ...operandOptions,
  }, host);
  const rightSubject = asNodeSubject(getNodeField(node, "Right"));
  const right = resolver.resolveSubject(rightSubject, context, {
    ...operandOptions,
  }, host) ?? getLiteralTargetTypeRefForKnownOperatorOperand(left, rightSubject, context);
  if (operator === "===" ||
    operator === "==" ||
    operator === "!==" ||
    operator === "!=" ||
    operator === "<" ||
    operator === "<=" ||
    operator === ">" ||
    operator === ">=" ||
    operator === "&&" ||
    operator === "||") {
    return csharpSourcePrimitiveTargetType("bool");
  }
  if (left === undefined || right === undefined) {
    return undefined;
  }
  if (operator === "??") {
    return unwrapNullableTargetType(left) ?? right;
  }
  if (isCsharpBitwiseOperator(operator) && !isIntegralTargetTypeRef(left)) {
    return undefined;
  }
  return left;
}

function getTargetTypeRefFromLiteralSyntax(
  node: Node,
  context: ExtensionObservationContext,
): TargetTypeRef | undefined {
  const ast = context.compiler?.ast;
  if (ast === undefined) {
    return undefined;
  }
  switch (ast.kindName(node)) {
    case "KindTrueKeyword":
    case "KindFalseKeyword":
      return csharpSourcePrimitiveTargetType("bool");
    case "KindNumericLiteral":
      return csharpSourcePrimitiveTargetType("float64");
    case "KindBigIntLiteral":
      return csharpBigIntegerTargetType();
    case "KindStringLiteral":
    case "KindNoSubstitutionTemplateLiteral":
    case "KindTemplateExpression":
      return csharpStringTargetType();
    default:
      return undefined;
  }
}
