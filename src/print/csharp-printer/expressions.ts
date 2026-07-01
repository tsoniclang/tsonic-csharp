import type {
  CsharpArgument,
  CsharpAssignmentOperatorToken,
  CsharpBinaryOperatorToken,
  CsharpCollectionInitializerElement,
  CsharpExpression,
  CsharpInterpolatedStringPart,
  CsharpLambdaParameter,
  CsharpObjectInitializerAssignment,
  CsharpPostfixUnaryOperatorToken,
  CsharpPrefixUnaryOperatorToken,
  CsharpTypeNode,
} from "../../backend/roslyn/syntax.js";
import type { CsharpPrintContext } from "./context.js";
import { failUnsupportedCsharpSyntax } from "./fail-closed.js";
import {
  escapeCsharpInterpolatedStringText,
  indentLines,
  printCharLiteral,
  printLiteral,
  printNumericLiteral,
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
    case "LiteralExpression":
      return printLiteral(expression.value);
    case "NumericLiteralExpression":
      return printNumericLiteral(expression.value, expression.suffix);
    case "CharacterLiteralExpression":
      return printCharLiteral(expression.value);
    case "InterpolatedStringExpression":
      return printInterpolatedString(expression.parts, context);
    case "ParenthesizedExpression":
      return `(${context.printExpression(expression.expression)})`;
    case "SimpleMemberAccessExpression":
      return `${context.printExpression(expression.receiver)}.${printMemberName(expression.name, expression.typeArguments, context)}`;
    case "ConditionalAccessExpression":
      return `${context.printExpression(expression.receiver)}?.${printMemberName(expression.name, expression.typeArguments, context)}`;
    case "ElementAccessExpression":
      return `${context.printExpression(expression.receiver)}[${context.printExpression(expression.argument)}]`;
    case "ConditionalElementAccessExpression":
      return `${context.printExpression(expression.receiver)}?[${context.printExpression(expression.argument)}]`;
    case "InvocationExpression":
      return `${context.printExpression(expression.callee)}(${expression.arguments.map(context.printArgument).join(", ")})`;
    case "AwaitExpression":
      return `await ${context.printExpression(expression.expression)}`;
    case "ObjectCreationExpression":
      if (expression.collectionInitializers !== undefined) {
        return printCsharpCollectionInitializer(expression.type, expression.arguments ?? [], expression.collectionInitializers, context);
      }
      return expression.assignments === undefined
        ? printCsharpObjectCreation(expression.type, expression.arguments ?? [], context)
        : printCsharpObjectInitializer(expression.type, expression.arguments ?? [], expression.assignments, context);
    case "CastExpression":
      return `(${context.printType(expression.type)})${context.printExpression(expression.expression)}`;
    case "BinaryExpression":
      return `${context.printExpression(expression.left)} ${printCsharpBinaryOperatorToken(expression.operatorToken)} ${context.printExpression(expression.right)}`;
    case "AssignmentExpression":
      return `${context.printExpression(expression.left)} ${printCsharpAssignmentOperatorToken(expression.operatorToken)} ${context.printExpression(expression.right)}`;
    case "IsPatternExpression":
      return `${context.printExpression(expression.expression)} is ${expression.negated === true ? "not " : ""}${context.printType(expression.type)}`;
    case "PrefixUnaryExpression":
      return `${printCsharpPrefixUnaryOperatorToken(expression.operatorToken)}${context.printExpression(expression.operand)}`;
    case "PostfixUnaryExpression":
      return `${context.printExpression(expression.operand)}${printCsharpPostfixUnaryOperatorToken(expression.operatorToken)}`;
    case "ConditionalExpression":
      return `${context.printExpression(expression.condition)} ? ${context.printExpression(expression.whenTrue)} : ${context.printExpression(expression.whenFalse)}`;
    case "ArrayCreationExpression": {
      if (expression.size !== undefined) {
        return expression.elementType === undefined
          ? `new[] { }`
          : `new ${context.printType(expression.elementType)}[${context.printExpression(expression.size)}]`;
      }
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
  return failUnsupportedCsharpSyntax(expression, "expression");
}

function printMemberName(
  name: string,
  typeArguments: readonly CsharpTypeNode[] | undefined,
  context: CsharpPrintContext,
): string {
  return typeArguments === undefined || typeArguments.length === 0
    ? name
    : `${name}<${typeArguments.map(context.printType).join(", ")}>`;
}

function printCsharpBinaryOperatorToken(token: CsharpBinaryOperatorToken): string {
  switch (token.kind) {
    case "AmpersandAmpersandToken":
      return "&&";
    case "BarBarToken":
      return "||";
    case "QuestionQuestionToken":
      return "??";
    case "AmpersandToken":
      return "&";
    case "BarToken":
      return "|";
    case "CaretToken":
      return "^";
    case "EqualsEqualsToken":
      return "==";
    case "ExclamationEqualsToken":
      return "!=";
    case "LessThanToken":
      return "<";
    case "LessThanEqualsToken":
      return "<=";
    case "GreaterThanToken":
      return ">";
    case "GreaterThanEqualsToken":
      return ">=";
    case "LessThanLessThanToken":
      return "<<";
    case "GreaterThanGreaterThanToken":
      return ">>";
    case "GreaterThanGreaterThanGreaterThanToken":
      return ">>>";
    case "PlusToken":
      return "+";
    case "MinusToken":
      return "-";
    case "AsteriskToken":
      return "*";
    case "SlashToken":
      return "/";
    case "PercentToken":
      return "%";
  }
  return failUnsupportedCsharpSyntax(token, "binary operator token");
}

function printCsharpAssignmentOperatorToken(token: CsharpAssignmentOperatorToken): string {
  switch (token.kind) {
    case "EqualsToken":
      return "=";
    case "PlusEqualsToken":
      return "+=";
    case "MinusEqualsToken":
      return "-=";
    case "AsteriskEqualsToken":
      return "*=";
    case "SlashEqualsToken":
      return "/=";
    case "PercentEqualsToken":
      return "%=";
    case "AmpersandEqualsToken":
      return "&=";
    case "BarEqualsToken":
      return "|=";
    case "CaretEqualsToken":
      return "^=";
    case "LessThanLessThanEqualsToken":
      return "<<=";
    case "GreaterThanGreaterThanEqualsToken":
      return ">>=";
    case "GreaterThanGreaterThanGreaterThanEqualsToken":
      return ">>>=";
  }
  return failUnsupportedCsharpSyntax(token, "assignment operator token");
}

function printCsharpPrefixUnaryOperatorToken(token: CsharpPrefixUnaryOperatorToken): string {
  switch (token.kind) {
    case "PlusToken":
      return "+";
    case "MinusToken":
      return "-";
    case "TildeToken":
      return "~";
    case "ExclamationToken":
      return "!";
    case "PlusPlusToken":
      return "++";
    case "MinusMinusToken":
      return "--";
  }
  return failUnsupportedCsharpSyntax(token, "prefix unary operator token");
}

function printCsharpPostfixUnaryOperatorToken(token: CsharpPostfixUnaryOperatorToken): string {
  switch (token.kind) {
    case "PlusPlusToken":
      return "++";
    case "MinusMinusToken":
      return "--";
  }
  return failUnsupportedCsharpSyntax(token, "postfix unary operator token");
}

function printCsharpObjectInitializer(
  type: CsharpTypeNode,
  argumentsList: readonly CsharpArgument[],
  assignments: readonly CsharpObjectInitializerAssignment[],
  context: CsharpPrintContext,
): string {
  if (assignments.length === 0) {
    return printCsharpObjectCreation(type, argumentsList, context);
  }
  return [
    printCsharpObjectCreationHeader(type, argumentsList, context),
    "{",
    ...indentLines(assignments.map((assignment) =>
      `${assignment.name} = ${context.printExpression(assignment.expression)},`)),
    "}",
  ].join("\n");
}

function printCsharpCollectionInitializer(
  type: CsharpTypeNode,
  argumentsList: readonly CsharpArgument[],
  initializers: readonly CsharpCollectionInitializerElement[],
  context: CsharpPrintContext,
): string {
  if (initializers.length === 0) {
    return printCsharpObjectCreation(type, argumentsList, context);
  }
  return [
    printCsharpObjectCreationHeader(type, argumentsList, context),
    "{",
    ...indentLines(initializers.map((initializer) => printCsharpCollectionInitializerElement(initializer, context))),
    "}",
  ].join("\n");
}

function printCsharpCollectionInitializerElement(
  initializer: CsharpCollectionInitializerElement,
  context: CsharpPrintContext,
): string {
  switch (initializer.kind) {
    case "IndexerInitializer":
      return `[${initializer.arguments.map(context.printExpression).join(", ")}] = ${context.printExpression(initializer.expression)},`;
  }
  return failUnsupportedCsharpSyntax(initializer, "collection initializer element");
}

function printCsharpObjectCreation(
  type: CsharpTypeNode,
  argumentsList: readonly CsharpArgument[],
  context: CsharpPrintContext,
): string {
  const header = printCsharpObjectCreationHeader(type, argumentsList, context);
  return argumentsList.length === 0 ? `${header}()` : header;
}

function printCsharpObjectCreationHeader(
  type: CsharpTypeNode,
  argumentsList: readonly CsharpArgument[],
  context: CsharpPrintContext,
): string {
  return argumentsList.length === 0
    ? `new ${context.printType(type)}`
    : `new ${context.printType(type)}(${argumentsList.map(context.printArgument).join(", ")})`;
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
        return `{${printInterpolationExpression(part.expression, context)}}`;
    }
    return failUnsupportedCsharpSyntax(part, "interpolated string part");
  }).join("");
  return `$"${body}"`;
}

function printInterpolationExpression(
  expression: CsharpExpression,
  context: CsharpPrintContext,
): string {
  const printed = context.printExpression(expression);
  return expression.kind === "ConditionalExpression" ? `(${printed})` : printed;
}
