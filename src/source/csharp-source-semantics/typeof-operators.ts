import type {
  CheckedOperatorMappingRequest,
  ExtensionFactSubject,
  ExtensionObservationContext,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  asNodeSubject,
} from "./ast-utils.js";
import {
  targetOperation,
} from "./operations.js";
import {
  sourcePrimitiveRuntimeKind,
  unwrapNullableTargetType,
} from "./target-rules.js";

export function getTypeofComparisonOperation(
  request: CheckedOperatorMappingRequest,
  context: ExtensionObservationContext,
) {
  if (request.operator !== "===" && request.operator !== "==" && request.operator !== "!==" && request.operator !== "!=") {
    return undefined;
  }
  const leftKind = getTypeofLiteralComparisonKind(request.left, request.right, context);
  const rightKind = leftKind ?? getTypeofLiteralComparisonKind(request.right, request.left, context);
  if (rightKind === undefined) {
    return undefined;
  }
  const negated = request.operator === "!==" || request.operator === "!=";
  return targetOperation(
    `tsonic.csharp.typeof.${negated ? "not-" : ""}${rightKind}`,
    "operator",
    `${negated ? "typeof-is-not" : "typeof-is"}:${rightKind}`,
  );
}

export function getTypeofRuntimeKind(
  type: TargetTypeRef | undefined,
  options: { readonly allowNullableUnwrap: boolean },
): "string" | "number" | "boolean" | "bigint" | undefined {
  const unwrapped = unwrapNullableTargetType(type);
  if (unwrapped !== type) {
    return options.allowNullableUnwrap ? getTypeofRuntimeKind(unwrapped, options) : undefined;
  }
  if (type?.kind === "source-primitive") {
    return sourcePrimitiveRuntimeKind(type.name);
  }
  if (type?.kind === "target-named") {
    if (type.id === "System.String") {
      return "string";
    }
    if (type.id === "System.Boolean") {
      return "boolean";
    }
    if (type.id === "System.Numerics.BigInteger") {
      return "bigint";
    }
  }
  return undefined;
}

function getTypeofLiteralComparisonKind(
  typeofExpression: ExtensionFactSubject | undefined,
  literal: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): "string" | "number" | "boolean" | "bigint" | undefined {
  const ast = context.compiler?.ast;
  const expressionNode = asNodeSubject(typeofExpression);
  const literalNode = asNodeSubject(literal);
  if (ast === undefined || expressionNode === undefined || literalNode === undefined || !ast.is.IsTypeOfExpression(expressionNode) || !ast.is.IsStringLiteral(literalNode)) {
    return undefined;
  }
  const text = ast.text(literalNode);
  return text === "string" || text === "number" || text === "boolean" || text === "bigint" ? text : undefined;
}
