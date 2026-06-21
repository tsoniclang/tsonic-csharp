import type {
  CsharpExpression,
  CsharpInterpolatedStringPart,
  CsharpLambdaParameter,
  CsharpObjectInitializerAssignment,
  CsharpTypeNode,
} from "../../backend/roslyn/syntax.js";
import type { CsharpPrintContext } from "./context.js";
import {
  escapeCsharpInterpolatedStringText,
  indentLines,
  printCharLiteral,
  printLiteral,
} from "./format.js";
import { isCsharpTypeSyntax } from "./types.js";

export function printCsharpExpression(
  expression: CsharpExpression,
  context: CsharpPrintContext,
): string {
  if (isCsharpTypeSyntax(expression)) {
    return context.printType(expression);
  }
  switch (expression.kind) {
    case "InvalidExpression":
      throw new Error(`Invalid C# expression reached printer: ${expression.reason}`);
    case "LiteralExpression":
      return printLiteral(expression.value);
    case "CharacterLiteralExpression":
      return printCharLiteral(expression.value);
    case "InterpolatedStringExpression":
      return printInterpolatedString(expression.parts, context);
    case "ParenthesizedExpression":
      return `(${context.printExpression(expression.expression)})`;
    case "SimpleMemberAccessExpression":
      return `${context.printExpression(expression.receiver)}.${expression.name}`;
    case "ConditionalAccessExpression":
      return `${context.printExpression(expression.receiver)}?.${expression.name}`;
    case "ElementAccessExpression":
      return `${context.printExpression(expression.receiver)}[${context.printExpression(expression.argument)}]`;
    case "ConditionalElementAccessExpression":
      return `${context.printExpression(expression.receiver)}?[${context.printExpression(expression.argument)}]`;
    case "InvocationExpression":
      return `${context.printExpression(expression.callee)}(${expression.arguments.map(context.printArgument).join(", ")})`;
    case "AwaitExpression":
      return `await ${context.printExpression(expression.expression)}`;
    case "ObjectCreationExpression":
      return expression.assignments === undefined
        ? `new ${context.printType(expression.type)}(${(expression.arguments ?? []).map(context.printArgument).join(", ")})`
        : printCsharpObjectInitializer(expression.type, expression.assignments, context);
    case "BinaryExpression":
      return `${context.printExpression(expression.left)} ${expression.operator} ${context.printExpression(expression.right)}`;
    case "IsPatternExpression":
      return `${context.printExpression(expression.expression)} is ${expression.negated === true ? "not " : ""}${context.printType(expression.type)}`;
    case "PrefixUnaryExpression":
      return `${expression.operator}${context.printExpression(expression.operand)}`;
    case "PostfixUnaryExpression":
      return `${context.printExpression(expression.operand)}${expression.operator}`;
    case "ConditionalExpression":
      return `${context.printExpression(expression.condition)} ? ${context.printExpression(expression.whenTrue)} : ${context.printExpression(expression.whenFalse)}`;
    case "ArrayCreationExpression": {
      const elements = expression.elements.map(context.printExpression).join(", ");
      const initializer = elements.length === 0 ? "{ }" : `{ ${elements} }`;
      return expression.elementType === undefined
        ? `new[] ${initializer}`
        : `new ${context.printType(expression.elementType)}[] ${initializer}`;
    }
    case "TupleExpression":
      return `(${expression.elements.map(context.printExpression).join(", ")})`;
    case "DefaultExpression":
      return `default(${context.printType(expression.type)})`;
    case "LambdaExpression":
      return printCsharpLambda(expression, context);
  }
}

function printCsharpObjectInitializer(
  type: CsharpTypeNode,
  assignments: readonly CsharpObjectInitializerAssignment[],
  context: CsharpPrintContext,
): string {
  if (assignments.length === 0) {
    return `new ${context.printType(type)}()`;
  }
  return [
    `new ${context.printType(type)}`,
    "{",
    ...indentLines(assignments.map((assignment) =>
      `${assignment.name} = ${context.printExpression(assignment.expression)},`)),
    "}",
  ].join("\n");
}

function printCsharpLambda(
  lambda: Extract<CsharpExpression, { readonly kind: "LambdaExpression" }>,
  context: CsharpPrintContext,
): string {
  const parameters = printCsharpLambdaParameters(lambda.parameters, context);
  const asyncPrefix = lambda.async === true ? "async " : "";
  if ("statements" in lambda.body) {
    return [`${asyncPrefix}${parameters} =>`, "{", ...indentLines(context.printStatements(lambda.body.statements)), "}"].join("\n");
  }
  return `${asyncPrefix}${parameters} => ${context.printExpression(lambda.body)}`;
}

function printCsharpLambdaParameters(
  parameters: readonly CsharpLambdaParameter[],
  context: CsharpPrintContext,
): string {
  const first = parameters[0];
  if (parameters.length === 1 && first !== undefined && first.type === undefined) {
    return printCsharpLambdaParameter(first, context);
  }
  return `(${parameters.map((parameter) => printCsharpLambdaParameter(parameter, context)).join(", ")})`;
}

function printCsharpLambdaParameter(
  parameter: CsharpLambdaParameter,
  context: CsharpPrintContext,
): string {
  return parameter.type === undefined
    ? parameter.name
    : `${context.printType(parameter.type)} ${parameter.name}`;
}

function printInterpolatedString(
  parts: readonly CsharpInterpolatedStringPart[],
  context: CsharpPrintContext,
): string {
  const body = parts.map((part) => {
    switch (part.kind) {
      case "InterpolatedStringText":
        return escapeCsharpInterpolatedStringText(part.text);
      case "Interpolation":
        return `{${context.printExpression(part.expression)}}`;
    }
  }).join("");
  return `$"${body}"`;
}
