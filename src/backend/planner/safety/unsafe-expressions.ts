import type {
  CsharpArgument,
  CsharpBlock,
  CsharpCollectionInitializerElement,
  CsharpExpression,
} from "../../target-ast/roslyn/index.js";
import {
  csharpTypeRequiresUnsafe,
} from "../types/target-types.js";
import {
  lambdaParameterRequiresUnsafe,
  optionalTypeRequiresUnsafe,
} from "./unsafe-type-members.js";

export type BlockUnsafeChecker = (block: CsharpBlock) => boolean;
type CsharpUnsafeScanMode = "context" | "permission";

export function optionalExpressionRequiresUnsafe(
  expression: CsharpExpression | undefined,
  blockRequiresUnsafe: BlockUnsafeChecker,
): boolean {
  return expression !== undefined && expressionRequiresUnsafe(
    expression,
    blockRequiresUnsafe,
  );
}

export function expressionRequiresUnsafe(
  expression: CsharpExpression,
  blockRequiresUnsafe: BlockUnsafeChecker,
): boolean {
  return expressionContainsUnsafe(
    expression,
    blockRequiresUnsafe,
    "context",
  );
}

export function optionalExpressionRequiresUnsafePermission(
  expression: CsharpExpression | undefined,
  blockRequiresUnsafePermission: BlockUnsafeChecker,
): boolean {
  return expression !== undefined && expressionRequiresUnsafePermission(
    expression,
    blockRequiresUnsafePermission,
  );
}

export function expressionRequiresUnsafePermission(
  expression: CsharpExpression,
  blockRequiresUnsafePermission: BlockUnsafeChecker,
): boolean {
  return expressionContainsUnsafe(
    expression,
    blockRequiresUnsafePermission,
    "permission",
  );
}

function expressionContainsUnsafe(
  expression: CsharpExpression,
  blockContainsUnsafe: BlockUnsafeChecker,
  mode: CsharpUnsafeScanMode,
): boolean {
  switch (expression.kind) {
    case "AliasQualifiedName":
    case "ArrayType":
    case "FunctionPointerType":
    case "IdentifierName":
    case "InvalidType":
    case "NullableType":
    case "PointerType":
    case "PredefinedType":
    case "QualifiedName":
    case "TupleType":
      return mode === "context" && csharpTypeRequiresUnsafe(expression);
    case "ParenthesizedExpression":
    case "AwaitExpression":
    case "CheckedExpression":
      return expressionContainsUnsafe(
        expression.expression,
        blockContainsUnsafe,
        mode,
      );
    case "UnsafeExpression":
      return mode === "permission";
    case "InvocationExpression":
      return expressionContainsUnsafe(
        expression.callee,
        blockContainsUnsafe,
        mode,
      ) || expression.arguments.some((argument) => argumentContainsUnsafe(
        argument,
        blockContainsUnsafe,
        mode,
      ));
    case "ObjectCreationExpression":
      return (mode === "context" && csharpTypeRequiresUnsafe(expression.type)) ||
        (expression.arguments ?? []).some((argument) => argumentContainsUnsafe(
          argument,
          blockContainsUnsafe,
          mode,
        )) ||
        (expression.assignments ?? []).some((assignment) =>
          expressionContainsUnsafe(
            assignment.expression,
            blockContainsUnsafe,
            mode,
          )) ||
        (expression.collectionInitializers ?? []).some((initializer) =>
          collectionInitializerContainsUnsafe(
            initializer,
            blockContainsUnsafe,
            mode,
          ));
    case "CastExpression":
      return (mode === "context" && csharpTypeRequiresUnsafe(expression.type)) ||
        expressionContainsUnsafe(
          expression.expression,
          blockContainsUnsafe,
          mode,
        );
    case "SimpleMemberAccessExpression":
    case "ConditionalAccessExpression":
      return expressionContainsUnsafe(
        expression.receiver,
        blockContainsUnsafe,
        mode,
      );
    case "ElementAccessExpression":
    case "ConditionalElementAccessExpression":
      return expressionContainsUnsafe(
        expression.receiver,
        blockContainsUnsafe,
        mode,
      ) || expression.arguments.some((argument) => expressionContainsUnsafe(
          argument,
          blockContainsUnsafe,
          mode,
        ));
    case "BinaryExpression":
    case "AssignmentExpression":
      return expressionContainsUnsafe(
        expression.left,
        blockContainsUnsafe,
        mode,
      ) || expressionContainsUnsafe(
        expression.right,
        blockContainsUnsafe,
        mode,
      );
    case "IsPatternExpression":
      return expressionContainsUnsafe(
        expression.expression,
        blockContainsUnsafe,
        mode,
      ) || (mode === "context" && csharpTypeRequiresUnsafe(expression.type));
    case "NullPatternExpression":
      return expressionContainsUnsafe(
        expression.expression,
        blockContainsUnsafe,
        mode,
      );
    case "PrefixUnaryExpression":
      return expression.operatorToken.kind === "AsteriskToken" ||
        expressionContainsUnsafe(
          expression.operand,
          blockContainsUnsafe,
          mode,
        );
    case "PostfixUnaryExpression":
      return expressionContainsUnsafe(
        expression.operand,
        blockContainsUnsafe,
        mode,
      );
    case "ConditionalExpression":
      return expressionContainsUnsafe(
        expression.condition,
        blockContainsUnsafe,
        mode,
      ) || expressionContainsUnsafe(
        expression.whenTrue,
        blockContainsUnsafe,
        mode,
      ) || expressionContainsUnsafe(
        expression.whenFalse,
        blockContainsUnsafe,
        mode,
      );
    case "ArrayCreationExpression":
      if (expression.size !== undefined) {
        return (mode === "context" && optionalTypeRequiresUnsafe(
          expression.elementType,
        )) || expressionContainsUnsafe(
          expression.size,
          blockContainsUnsafe,
          mode,
        ) || expression.elements.some((element) => expressionContainsUnsafe(
          element,
          blockContainsUnsafe,
          mode,
        ));
      }
      return (mode === "context" && optionalTypeRequiresUnsafe(
        expression.elementType,
      )) || expression.elements.some((element) => expressionContainsUnsafe(
        element,
        blockContainsUnsafe,
        mode,
      ));
    case "TupleExpression":
      return expression.elements.some((element) => expressionContainsUnsafe(
        element,
        blockContainsUnsafe,
        mode,
      ));
    case "DefaultExpression":
      return mode === "context" && csharpTypeRequiresUnsafe(expression.type);
    case "LambdaExpression":
      return (mode === "context" && expression.parameters.some(
        lambdaParameterRequiresUnsafe,
      )) || (expression.body.kind === "Block"
        ? blockContainsUnsafe(expression.body)
        : expressionContainsUnsafe(
            expression.body,
            blockContainsUnsafe,
            mode,
          ));
    case "InterpolatedStringExpression":
      return expression.parts.some((part) =>
        part.kind === "Interpolation" && expressionContainsUnsafe(
          part.expression,
          blockContainsUnsafe,
          mode,
        )
      );
    case "LiteralExpression":
    case "NumericLiteralExpression":
    case "IntegerLiteralExpression":
    case "CharacterLiteralExpression":
      return false;
  }
}

export function argumentRequiresUnsafe(argument: CsharpArgument, blockRequiresUnsafe: BlockUnsafeChecker): boolean {
  return expressionRequiresUnsafe(argument.expression, blockRequiresUnsafe);
}

export function argumentRequiresUnsafePermission(
  argument: CsharpArgument,
  blockRequiresUnsafePermission: BlockUnsafeChecker,
): boolean {
  return expressionRequiresUnsafePermission(
    argument.expression,
    blockRequiresUnsafePermission,
  );
}

function argumentContainsUnsafe(
  argument: CsharpArgument,
  blockContainsUnsafe: BlockUnsafeChecker,
  mode: CsharpUnsafeScanMode,
): boolean {
  return expressionContainsUnsafe(
    argument.expression,
    blockContainsUnsafe,
    mode,
  );
}

function collectionInitializerContainsUnsafe(
  initializer: CsharpCollectionInitializerElement,
  blockContainsUnsafe: BlockUnsafeChecker,
  mode: CsharpUnsafeScanMode,
): boolean {
  switch (initializer.kind) {
    case "IndexerInitializer":
      return initializer.arguments.some((argument) => expressionContainsUnsafe(
        argument,
        blockContainsUnsafe,
        mode,
      )) || expressionContainsUnsafe(
        initializer.expression,
        blockContainsUnsafe,
        mode,
      );
  }
}
