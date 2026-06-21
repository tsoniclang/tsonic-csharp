import type { CsharpBlock } from "./statements.js";
import type { CsharpTypeNode } from "./types.js";

export type CsharpExpression =
  | CsharpTypeNode
  | { readonly kind: "InvalidExpression"; readonly reason: string }
  | { readonly kind: "LiteralExpression"; readonly value: string | number | boolean | null }
  | { readonly kind: "CharacterLiteralExpression"; readonly value: string }
  | { readonly kind: "InterpolatedStringExpression"; readonly parts: readonly CsharpInterpolatedStringPart[] }
  | { readonly kind: "ParenthesizedExpression"; readonly expression: CsharpExpression }
  | { readonly kind: "InvocationExpression"; readonly callee: CsharpExpression; readonly arguments: readonly CsharpArgument[] }
  | { readonly kind: "AwaitExpression"; readonly expression: CsharpExpression }
  | { readonly kind: "ObjectCreationExpression"; readonly type: CsharpTypeNode; readonly arguments?: readonly CsharpArgument[]; readonly assignments?: readonly CsharpObjectInitializerAssignment[] }
  | { readonly kind: "SimpleMemberAccessExpression"; readonly receiver: CsharpExpression; readonly name: string }
  | { readonly kind: "ConditionalAccessExpression"; readonly receiver: CsharpExpression; readonly name: string }
  | { readonly kind: "ElementAccessExpression"; readonly receiver: CsharpExpression; readonly argument: CsharpExpression }
  | { readonly kind: "ConditionalElementAccessExpression"; readonly receiver: CsharpExpression; readonly argument: CsharpExpression }
  | { readonly kind: "BinaryExpression"; readonly left: CsharpExpression; readonly operator: string; readonly right: CsharpExpression }
  | { readonly kind: "IsPatternExpression"; readonly expression: CsharpExpression; readonly type: CsharpTypeNode; readonly negated?: boolean }
  | { readonly kind: "PrefixUnaryExpression"; readonly operator: string; readonly operand: CsharpExpression }
  | { readonly kind: "PostfixUnaryExpression"; readonly operand: CsharpExpression; readonly operator: string }
  | { readonly kind: "ConditionalExpression"; readonly condition: CsharpExpression; readonly whenTrue: CsharpExpression; readonly whenFalse: CsharpExpression }
  | { readonly kind: "ArrayCreationExpression"; readonly elements: readonly CsharpExpression[]; readonly elementType?: CsharpTypeNode }
  | { readonly kind: "TupleExpression"; readonly elements: readonly CsharpExpression[] }
  | { readonly kind: "DefaultExpression"; readonly type: CsharpTypeNode }
  | { readonly kind: "LambdaExpression"; readonly async?: boolean; readonly parameters: readonly CsharpLambdaParameter[]; readonly body: CsharpExpression | CsharpBlock };

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

export type CsharpInterpolatedStringPart =
  | { readonly kind: "InterpolatedStringText"; readonly text: string }
  | { readonly kind: "Interpolation"; readonly expression: CsharpExpression };

export interface CsharpArgument {
  readonly kind: "Argument";
  readonly expression: CsharpExpression;
  readonly passing?: "in" | "out" | "ref";
}
