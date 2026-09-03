import type { CsharpBlock } from "./statements.js";
import type { CsharpTypeNode } from "./types.js";

export type CsharpExpression =
  | CsharpTypeNode
  | {
      readonly kind: "LiteralExpression";
      readonly value: string | number | boolean | null;
      readonly stringStyle?: "raw";
    }
  | { readonly kind: "NumericLiteralExpression"; readonly value: number; readonly suffix?: "F" | "D" | "M" }
  | { readonly kind: "IntegerLiteralExpression"; readonly digits: string; readonly suffix: "L" | "UL" }
  | { readonly kind: "CharacterLiteralExpression"; readonly value: string }
  | { readonly kind: "InterpolatedStringExpression"; readonly parts: readonly CsharpInterpolatedStringPart[] }
  | { readonly kind: "ParenthesizedExpression"; readonly expression: CsharpExpression }
  | { readonly kind: "InvocationExpression"; readonly callee: CsharpExpression; readonly arguments: readonly CsharpArgument[] }
  | { readonly kind: "AwaitExpression"; readonly expression: CsharpExpression }
  | { readonly kind: "UnsafeExpression"; readonly expression: CsharpExpression }
  | { readonly kind: "CheckedExpression"; readonly expression: CsharpExpression }
  | CsharpObjectCreationExpression
  | { readonly kind: "CastExpression"; readonly type: CsharpTypeNode; readonly expression: CsharpExpression }
  | { readonly kind: "SimpleMemberAccessExpression"; readonly receiver: CsharpExpression; readonly name: string; readonly typeArguments?: readonly CsharpTypeNode[] }
  | { readonly kind: "ConditionalAccessExpression"; readonly receiver: CsharpExpression; readonly name: string; readonly typeArguments?: readonly CsharpTypeNode[] }
  | { readonly kind: "ElementAccessExpression"; readonly receiver: CsharpExpression; readonly arguments: readonly CsharpExpression[] }
  | { readonly kind: "ConditionalElementAccessExpression"; readonly receiver: CsharpExpression; readonly arguments: readonly CsharpExpression[] }
  | { readonly kind: "BinaryExpression"; readonly left: CsharpExpression; readonly operatorToken: CsharpBinaryOperatorToken; readonly right: CsharpExpression }
  | { readonly kind: "AssignmentExpression"; readonly left: CsharpExpression; readonly operatorToken: CsharpAssignmentOperatorToken; readonly right: CsharpExpression }
  | { readonly kind: "IsPatternExpression"; readonly expression: CsharpExpression; readonly type: CsharpTypeNode; readonly negated?: boolean; readonly designation?: string }
  | { readonly kind: "NullPatternExpression"; readonly expression: CsharpExpression; readonly negated: boolean }
  | { readonly kind: "PrefixUnaryExpression"; readonly operatorToken: CsharpPrefixUnaryOperatorToken; readonly operand: CsharpExpression }
  | { readonly kind: "PostfixUnaryExpression"; readonly operand: CsharpExpression; readonly operatorToken: CsharpPostfixUnaryOperatorToken }
  | { readonly kind: "ConditionalExpression"; readonly condition: CsharpExpression; readonly whenTrue: CsharpExpression; readonly whenFalse: CsharpExpression }
  | { readonly kind: "ArrayCreationExpression"; readonly elements: readonly CsharpExpression[]; readonly elementType?: CsharpTypeNode; readonly size?: CsharpExpression }
  | { readonly kind: "TupleExpression"; readonly elements: readonly CsharpExpression[] }
  | { readonly kind: "DefaultExpression"; readonly type: CsharpTypeNode; readonly nullForgiving?: boolean }
  | { readonly kind: "LambdaExpression"; readonly async?: boolean; readonly parameters: readonly CsharpLambdaParameter[]; readonly body: CsharpExpression | CsharpBlock };

export type CsharpBinaryOperatorToken =
  | { readonly kind: "AmpersandAmpersandToken" }
  | { readonly kind: "BarBarToken" }
  | { readonly kind: "QuestionQuestionToken" }
  | { readonly kind: "AmpersandToken" }
  | { readonly kind: "BarToken" }
  | { readonly kind: "CaretToken" }
  | { readonly kind: "EqualsEqualsToken" }
  | { readonly kind: "ExclamationEqualsToken" }
  | { readonly kind: "LessThanToken" }
  | { readonly kind: "LessThanEqualsToken" }
  | { readonly kind: "GreaterThanToken" }
  | { readonly kind: "GreaterThanEqualsToken" }
  | { readonly kind: "LessThanLessThanToken" }
  | { readonly kind: "GreaterThanGreaterThanToken" }
  | { readonly kind: "GreaterThanGreaterThanGreaterThanToken" }
  | { readonly kind: "PlusToken" }
  | { readonly kind: "MinusToken" }
  | { readonly kind: "AsteriskToken" }
  | { readonly kind: "SlashToken" }
  | { readonly kind: "PercentToken" };

export type CsharpAssignmentOperatorToken =
  | { readonly kind: "EqualsToken" }
  | { readonly kind: "PlusEqualsToken" }
  | { readonly kind: "MinusEqualsToken" }
  | { readonly kind: "AsteriskEqualsToken" }
  | { readonly kind: "SlashEqualsToken" }
  | { readonly kind: "PercentEqualsToken" }
  | { readonly kind: "AmpersandEqualsToken" }
  | { readonly kind: "BarEqualsToken" }
  | { readonly kind: "CaretEqualsToken" }
  | { readonly kind: "LessThanLessThanEqualsToken" }
  | { readonly kind: "GreaterThanGreaterThanEqualsToken" }
  | { readonly kind: "GreaterThanGreaterThanGreaterThanEqualsToken" };

export type CsharpPrefixUnaryOperatorToken =
  | { readonly kind: "AsteriskToken" }
  | { readonly kind: "PlusToken" }
  | { readonly kind: "MinusToken" }
  | { readonly kind: "TildeToken" }
  | { readonly kind: "ExclamationToken" }
  | { readonly kind: "PlusPlusToken" }
  | { readonly kind: "MinusMinusToken" };

export type CsharpPostfixUnaryOperatorToken =
  | { readonly kind: "PlusPlusToken" }
  | { readonly kind: "MinusMinusToken" };

export interface CsharpLambdaParameter {
  readonly kind: "Parameter";
  readonly name: string;
  readonly type?: CsharpTypeNode;
}

export interface CsharpObjectInitializerAssignment {
  readonly kind: "AssignmentExpression";
  readonly name: string;
  readonly expression: CsharpExpression;
}

export type CsharpObjectCreationExpression = {
  readonly kind: "ObjectCreationExpression";
  readonly type: CsharpTypeNode;
  readonly arguments?: readonly CsharpArgument[];
} & (
  | {
      readonly assignments?: readonly CsharpObjectInitializerAssignment[];
      readonly collectionInitializers?: never;
    }
  | {
      readonly assignments?: never;
      readonly collectionInitializers: readonly CsharpCollectionInitializerElement[];
    }
);

export type CsharpCollectionInitializerElement =
  | CsharpIndexerInitializerElement;

export interface CsharpIndexerInitializerElement {
  readonly kind: "IndexerInitializer";
  readonly arguments: readonly CsharpExpression[];
  readonly expression: CsharpExpression;
}

export type CsharpInterpolatedStringPart =
  | { readonly kind: "InterpolatedStringText"; readonly text: string }
  | { readonly kind: "Interpolation"; readonly expression: CsharpExpression };

export interface CsharpArgument {
  readonly kind: "Argument";
  readonly expression: CsharpExpression;
  readonly passing?: "in" | "out" | "ref";
}
