import type {
  CsharpArgument,
  CsharpAttribute,
  CsharpGenericConstraint,
  CsharpParameter,
  CsharpTypeParameter,
} from "../../backend/roslyn/syntax.js";
import type { CsharpPrintContext } from "./context.js";

export function printCsharpAttributes(
  attributes: readonly CsharpAttribute[] | undefined,
  context: CsharpPrintContext,
): readonly string[] {
  return (attributes ?? []).map((attribute) => {
    const argumentsText = attribute.arguments === undefined || attribute.arguments.length === 0
      ? ""
      : `(${attribute.arguments.map(context.printArgument).join(", ")})`;
    return `[${context.printType(attribute.type)}${argumentsText}]`;
  });
}

export function printTypeParameters(typeParameters: readonly CsharpTypeParameter[] | undefined): string {
  return typeParameters === undefined || typeParameters.length === 0
    ? ""
    : `<${typeParameters.map((typeParameter) => typeParameter.name).join(", ")}>`;
}

export function printTypeParameterConstraintLines(
  typeParameters: readonly CsharpTypeParameter[] | undefined,
  context: CsharpPrintContext,
): string[] {
  return (typeParameters ?? []).flatMap((typeParameter) => printTypeParameterConstraint(typeParameter, context));
}

export function printTypeParameterConstraintSuffix(
  typeParameters: readonly CsharpTypeParameter[] | undefined,
  context: CsharpPrintContext,
): string {
  const constraints = printTypeParameterConstraintLines(typeParameters, context);
  return constraints.length === 0 ? "" : ` ${constraints.join(" ")}`;
}

export function printCsharpArgument(argument: CsharpArgument, context: CsharpPrintContext): string {
  const expression = context.printExpression(argument.expression);
  return argument.passing === undefined ? expression : `${argument.passing} ${expression}`;
}

export function printCsharpParameter(parameter: CsharpParameter, context: CsharpPrintContext): string {
  const attributes = context.printAttributes(parameter.attributes).join(" ");
  const attributePrefix = attributes.length === 0 ? "" : `${attributes} `;
  const paramsPrefix = parameter.isParams === true ? "params " : "";
  const passing = parameter.passing === undefined ? "" : `${parameter.passing} `;
  const defaultValue = parameter.defaultValue === undefined
    ? ""
    : ` = ${context.printExpression(parameter.defaultValue)}`;
  return `${attributePrefix}${paramsPrefix}${passing}${context.printType(parameter.type)} ${parameter.name}${defaultValue}`;
}

function printTypeParameterConstraint(
  typeParameter: CsharpTypeParameter,
  context: CsharpPrintContext,
): readonly string[] {
  const constraints = typeParameter.constraints ?? [];
  return constraints.length === 0
    ? []
    : [`where ${typeParameter.name} : ${constraints.map((constraint) => printGenericConstraint(constraint, context)).join(", ")}`];
}

function printGenericConstraint(
  constraint: CsharpGenericConstraint,
  context: CsharpPrintContext,
): string {
  switch (constraint.kind) {
    case "TypeConstraint":
      return context.printType(constraint.type);
    case "KeywordConstraint":
      return constraint.keyword;
    case "ConstructorConstraint":
      return "new()";
  }
}
