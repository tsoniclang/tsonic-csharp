import type {
  CsharpArgument,
  CsharpBlock,
  CsharpCollectionInitializerElement,
  CsharpExpression,
} from "../roslyn/syntax.js";
import {
  csharpTypeRequiresUnsafe,
} from "./target-types.js";
import {
  lambdaParameterRequiresUnsafe,
  optionalTypeRequiresUnsafe,
} from "./unsafe-type-members.js";

export type BlockUnsafeChecker = (block: CsharpBlock) => boolean;

export function optionalExpressionRequiresUnsafe(
  expression: CsharpExpression | undefined,
  blockRequiresUnsafe: BlockUnsafeChecker,
): boolean {
  return expression !== undefined && expressionRequiresUnsafe(expression, blockRequiresUnsafe);
}

export function expressionRequiresUnsafe(
  expression: CsharpExpression,
  blockRequiresUnsafe: BlockUnsafeChecker,
): boolean {
  switch (expression.kind) {
    case "ArrayType":
    case "FunctionPointerType":
    case "IdentifierName":
    case "InvalidType":
    case "NullableType":
    case "PointerType":
    case "PredefinedType":
    case "QualifiedName":
    case "TupleType":
      return csharpTypeRequiresUnsafe(expression);
    case "ParenthesizedExpression":
    case "AwaitExpression":
      return expressionRequiresUnsafe(expression.expression, blockRequiresUnsafe);
    case "InvocationExpression":
      return expressionRequiresUnsafe(expression.callee, blockRequiresUnsafe) ||
        expression.arguments.some((argument) => argumentRequiresUnsafe(argument, blockRequiresUnsafe));
    case "ObjectCreationExpression":
      return csharpTypeRequiresUnsafe(expression.type) ||
        (expression.arguments ?? []).some((argument) => argumentRequiresUnsafe(argument, blockRequiresUnsafe)) ||
        (expression.assignments ?? []).some((assignment) => expressionRequiresUnsafe(assignment.expression, blockRequiresUnsafe)) ||
        (expression.collectionInitializers ?? []).some((initializer) => collectionInitializerRequiresUnsafe(initializer, blockRequiresUnsafe));
    case "CastExpression":
      return csharpTypeRequiresUnsafe(expression.type) ||
        expressionRequiresUnsafe(expression.expression, blockRequiresUnsafe);
    case "SimpleMemberAccessExpression":
    case "ConditionalAccessExpression":
      return expressionRequiresUnsafe(expression.receiver, blockRequiresUnsafe);
    case "ElementAccessExpression":
    case "ConditionalElementAccessExpression":
      return expressionRequiresUnsafe(expression.receiver, blockRequiresUnsafe) ||
        expressionRequiresUnsafe(expression.argument, blockRequiresUnsafe);
    case "BinaryExpression":
    case "AssignmentExpression":
      return expressionRequiresUnsafe(expression.left, blockRequiresUnsafe) ||
        expressionRequiresUnsafe(expression.right, blockRequiresUnsafe);
    case "IsPatternExpression":
      return expressionRequiresUnsafe(expression.expression, blockRequiresUnsafe) || csharpTypeRequiresUnsafe(expression.type);
    case "PrefixUnaryExpression":
      return expressionRequiresUnsafe(expression.operand, blockRequiresUnsafe);
    case "PostfixUnaryExpression":
      return expressionRequiresUnsafe(expression.operand, blockRequiresUnsafe);
    case "ConditionalExpression":
      return expressionRequiresUnsafe(expression.condition, blockRequiresUnsafe) ||
        expressionRequiresUnsafe(expression.whenTrue, blockRequiresUnsafe) ||
        expressionRequiresUnsafe(expression.whenFalse, blockRequiresUnsafe);
    case "ArrayCreationExpression":
      if (expression.size !== undefined) {
        return optionalTypeRequiresUnsafe(expression.elementType) ||
          expressionRequiresUnsafe(expression.size, blockRequiresUnsafe) ||
          expression.elements.some((element) => expressionRequiresUnsafe(element, blockRequiresUnsafe));
      }
      return optionalTypeRequiresUnsafe(expression.elementType) ||
        expression.elements.some((element) => expressionRequiresUnsafe(element, blockRequiresUnsafe));
    case "TupleExpression":
      return expression.elements.some((element) => expressionRequiresUnsafe(element, blockRequiresUnsafe));
    case "DefaultExpression":
      return csharpTypeRequiresUnsafe(expression.type);
    case "LambdaExpression":
      return expression.parameters.some(lambdaParameterRequiresUnsafe) ||
        (Array.isArray((expression.body as { readonly statements?: unknown }).statements)
          ? blockRequiresUnsafe(expression.body as CsharpBlock)
          : expressionRequiresUnsafe(expression.body as CsharpExpression, blockRequiresUnsafe));
    case "InterpolatedStringExpression":
      return expression.parts.some((part) =>
        part.kind === "Interpolation" && expressionRequiresUnsafe(part.expression, blockRequiresUnsafe)
      );
    case "InvalidExpression":
    case "LiteralExpression":
    case "NumericLiteralExpression":
    case "CharacterLiteralExpression":
      return false;
  }
}

export function argumentRequiresUnsafe(argument: CsharpArgument, blockRequiresUnsafe: BlockUnsafeChecker): boolean {
  return expressionRequiresUnsafe(argument.expression, blockRequiresUnsafe);
}

function collectionInitializerRequiresUnsafe(
  initializer: CsharpCollectionInitializerElement,
  blockRequiresUnsafe: BlockUnsafeChecker,
): boolean {
  switch (initializer.kind) {
    case "IndexerInitializer":
      return initializer.arguments.some((argument) => expressionRequiresUnsafe(argument, blockRequiresUnsafe)) ||
        expressionRequiresUnsafe(initializer.expression, blockRequiresUnsafe);
  }
}
