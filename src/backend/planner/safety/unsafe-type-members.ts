import type {
  CsharpExpression,
  CsharpGenericConstraint,
  CsharpLambdaParameter,
  CsharpParameter,
  CsharpTypeNode,
  CsharpTypeParameter,
} from "../../roslyn/syntax.js";
import {
  csharpTypeRequiresUnsafe,
} from "../types/target-types.js";

export function typeParametersRequireUnsafe(typeParameters: readonly CsharpTypeParameter[] | undefined): boolean {
  return (typeParameters ?? []).some((typeParameter) => (typeParameter.constraints ?? []).some(genericConstraintRequiresUnsafe));
}

export function parameterRequiresUnsafe(
  parameter: CsharpParameter,
  optionalExpressionRequiresUnsafe: (expression: CsharpExpression | undefined) => boolean,
): boolean {
  return csharpTypeRequiresUnsafe(parameter.type) || optionalExpressionRequiresUnsafe(parameter.defaultValue);
}

export function lambdaParameterRequiresUnsafe(parameter: CsharpLambdaParameter): boolean {
  return optionalTypeRequiresUnsafe(parameter.type);
}

export function optionalTypeRequiresUnsafe(type: CsharpTypeNode | undefined): boolean {
  return type !== undefined && csharpTypeRequiresUnsafe(type);
}

function genericConstraintRequiresUnsafe(constraint: CsharpGenericConstraint): boolean {
  return constraint.kind === "TypeConstraint" && csharpTypeRequiresUnsafe(constraint.type);
}
