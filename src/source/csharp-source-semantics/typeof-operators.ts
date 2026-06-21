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
  csharpTargetTypeofComparisonOperation,
  targetOperation,
} from "./operations.js";
import {
  type CsharpTypeofRuntimeKind,
} from "../csharp-facts.js";
import {
  csharpSourcePrimitiveTargetType,
  csharpTargetNamedType,
  getCsharpTypeofRuntimeKindForTargetType,
} from "./target-types.js";
import {
  sourcePrimitiveRuntimeKind,
  unwrapNullableTargetType,
} from "./target-rules.js";

export function getTypeofComparisonOperation(
  request: CheckedOperatorMappingRequest,
  context: ExtensionObservationContext,
): { readonly operation: ReturnType<typeof targetOperation>; readonly csharpOperation: ReturnType<typeof csharpTargetTypeofComparisonOperation> } | undefined {
  if (request.operator !== "===" && request.operator !== "==" && request.operator !== "!==" && request.operator !== "!=") {
    return undefined;
  }
  const leftKind = getTypeofLiteralComparisonKind(request.left, request.right, context);
  const rightKind = leftKind ?? getTypeofLiteralComparisonKind(request.right, request.left, context);
  if (rightKind === undefined) {
    return undefined;
  }
  const targetType = getTypeofComparisonTargetType(rightKind);
  if (targetType === undefined) {
    return undefined;
  }
  const negated = request.operator === "!==" || request.operator === "!=";
  const operationId = `tsonic.csharp.typeof.${negated ? "not-" : ""}${rightKind}`;
  return {
    operation: targetOperation(operationId, "operator", "typeof-comparison"),
    csharpOperation: csharpTargetTypeofComparisonOperation(operationId, rightKind, targetType, negated),
  };
}

function getTypeofComparisonTargetType(kind: CsharpTypeofRuntimeKind): TargetTypeRef | undefined {
  switch (kind) {
    case "string":
      return csharpTargetNamedType("System.String");
    case "number":
      return csharpSourcePrimitiveTargetType("float64");
    case "boolean":
      return csharpSourcePrimitiveTargetType("bool");
    case "bigint":
      return csharpTargetNamedType("System.Numerics.BigInteger");
  }
}

export function getTypeofRuntimeKind(
  type: TargetTypeRef | undefined,
  options: { readonly allowNullableUnwrap: boolean },
): CsharpTypeofRuntimeKind | undefined {
  const unwrapped = unwrapNullableTargetType(type);
  if (unwrapped !== type) {
    return options.allowNullableUnwrap ? getTypeofRuntimeKind(unwrapped, options) : undefined;
  }
  if (type?.kind === "source-primitive") {
    return sourcePrimitiveRuntimeKind(type.name);
  }
  return getCsharpTypeofRuntimeKindForTargetType(type);
}

function getTypeofLiteralComparisonKind(
  typeofExpression: ExtensionFactSubject | undefined,
  literal: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): CsharpTypeofRuntimeKind | undefined {
  const ast = context.compiler?.ast;
  const expressionNode = asNodeSubject(typeofExpression);
  const literalNode = asNodeSubject(literal);
  if (ast === undefined || expressionNode === undefined || literalNode === undefined || !ast.is.IsTypeOfExpression(expressionNode) || !ast.is.IsStringLiteral(literalNode)) {
    return undefined;
  }
  const text = ast.text(literalNode);
  return text === "string" || text === "number" || text === "boolean" || text === "bigint" ? text : undefined;
}
