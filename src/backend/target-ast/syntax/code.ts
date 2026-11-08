import type { CsharpTypeNode } from "./types.js";
import type { CsharpNumericLiteralToken } from "../../../target-model/syntax/numeric-literals.js";

export type CsharpExpression =
  | CsharpTypeNode
  | {
      readonly kind: "LiteralExpression";
      readonly value: string | number | boolean | null;
      readonly stringStyle?: "raw";
    }
  | { readonly kind: "NumericLiteralExpression"; readonly token: CsharpNumericLiteralToken; readonly suffix: "F" | "M" | "D"; readonly value?: never }
  | { readonly kind: "NumericLiteralExpression"; readonly value: number; readonly suffix?: "D"; readonly token?: never }
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
  | { readonly kind: "SwitchExpression"; readonly expression: CsharpExpression; readonly arms: readonly CsharpSwitchExpressionArm[] }
  | { readonly kind: "ThrowExpression"; readonly expression: CsharpExpression }
  | { readonly kind: "ArrayCreationExpression"; readonly elements: readonly CsharpExpression[]; readonly elementType?: CsharpTypeNode; readonly size?: CsharpExpression }
  | { readonly kind: "CollectionExpression"; readonly elements: readonly {
      readonly kind: "ExpressionElement" | "SpreadElement";
      readonly expression: CsharpExpression;
    }[] }
  | { readonly kind: "TupleExpression"; readonly elements: readonly CsharpExpression[] }
  | { readonly kind: "DefaultExpression"; readonly type: CsharpTypeNode; readonly nullForgiving?: boolean }
  | { readonly kind: "LambdaExpression"; readonly async?: boolean; readonly parameters: readonly CsharpLambdaParameter[]; readonly body: CsharpExpression | CsharpBlock };

export type CsharpPattern =
  | { readonly kind: "ConstantPattern"; readonly expression: CsharpExpression }
  | { readonly kind: "DeclarationPattern"; readonly type: CsharpTypeNode; readonly designation: string }
  | { readonly kind: "VarPattern"; readonly designation: string }
  | { readonly kind: "DiscardPattern" };

export interface CsharpSwitchExpressionArm {
  readonly pattern: CsharpPattern;
  readonly when?: CsharpExpression;
  readonly expression: CsharpExpression;
}

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
  | { readonly kind: "QuestionQuestionEqualsToken" }
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
  | { readonly kind: "ExclamationToken" }
  | { readonly kind: "PlusPlusToken" }
  | { readonly kind: "MinusMinusToken" };

export type CsharpLambdaParameter = {
  readonly kind: "Parameter";
  readonly name: string;
} & (
  | { readonly type?: CsharpTypeNode; readonly passing?: never }
  | { readonly type: CsharpTypeNode; readonly passing: "in" | "out" | "ref" }
);

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

export type CsharpTypeMember =
  | CsharpConstructorDeclaration
  | CsharpStaticConstructorDeclaration
  | CsharpMethodDeclaration
  | CsharpFieldDeclaration
  | CsharpPropertyDeclaration;

export type CsharpInterfaceMember =
  | CsharpInterfaceMethodDeclaration
  | CsharpInterfacePropertyDeclaration
  | CsharpInterfaceIndexerDeclaration;

export interface CsharpInterfaceMethodDeclaration {
  readonly kind: "MethodDeclaration";
  readonly shadowsEnclosingTypeParameter?: true;
  readonly name: string;
  readonly attributes?: readonly CsharpAttribute[];
  readonly modifiers?: readonly CsharpModifier[];
  readonly typeParameters?: readonly CsharpTypeParameter[];
  readonly returnType: CsharpTypeNode;
  readonly returnPassing?: "ref" | "ref-readonly";
  readonly parameters: readonly CsharpParameter[];
  readonly body?: CsharpBlock;
}

export interface CsharpInterfacePropertyDeclaration {
  readonly kind: "PropertyDeclaration";
  readonly name: string;
  readonly attributes?: readonly CsharpAttribute[];
  readonly modifiers?: readonly CsharpModifier[];
  readonly getterModifiers?: readonly CsharpAccessorModifier[];
  readonly setterModifiers?: readonly CsharpAccessorModifier[];
  readonly writable: boolean;
  readonly type: CsharpTypeNode;
}

export interface CsharpInterfaceIndexerDeclaration {
  readonly kind: "IndexerDeclaration";
  readonly attributes?: readonly CsharpAttribute[];
  readonly modifiers?: readonly CsharpModifier[];
  readonly getterModifiers?: readonly CsharpAccessorModifier[];
  readonly setterModifiers?: readonly CsharpAccessorModifier[];
  readonly writable: boolean;
  readonly keyName: string;
  readonly keyType: CsharpTypeNode;
  readonly valueType: CsharpTypeNode;
}

export interface CsharpConstructorDeclaration {
  readonly kind: "ConstructorDeclaration";
  readonly name: string;
  readonly modifiers: readonly CsharpModifier[];
  readonly attributes?: readonly CsharpAttribute[];
  readonly parameters: readonly CsharpParameter[];
  readonly initializer?: {
    readonly kind: "base" | "this";
    readonly arguments: readonly CsharpArgument[];
  };
  readonly body: CsharpBlock;
}

export interface CsharpStaticConstructorDeclaration {
  readonly kind: "StaticConstructorDeclaration";
  readonly name: string;
  readonly body: CsharpBlock;
}

export interface CsharpMethodDeclaration {
  readonly kind: "MethodDeclaration";
  readonly shadowsEnclosingTypeParameter?: true;
  readonly explicitInterface?: CsharpTypeNode;
  readonly name: string;
  readonly modifiers: readonly CsharpModifier[];
  readonly attributes?: readonly CsharpAttribute[];
  readonly typeParameters?: readonly CsharpTypeParameter[];
  readonly returnType: CsharpTypeNode;
  readonly returnPassing?: "ref" | "ref-readonly";
  readonly parameters: readonly CsharpParameter[];
  readonly body?: CsharpBlock;
}

export interface CsharpTypeParameter {
  readonly name: string;
  readonly variance?: "in" | "out";
  readonly constraints?: readonly CsharpGenericConstraint[];
}

export type CsharpGenericConstraint =
  | { readonly kind: "TypeConstraint"; readonly type: CsharpTypeNode }
  | { readonly kind: "KeywordConstraint"; readonly keyword: "class" | "struct" | "notnull" | "unmanaged" | "default" }
  | { readonly kind: "ConstructorConstraint" };

export interface CsharpFieldDeclaration {
  readonly kind: "FieldDeclaration";
  readonly name: string;
  readonly modifiers: readonly CsharpModifier[];
  readonly attributes?: readonly CsharpAttribute[];
  readonly type: CsharpTypeNode;
  readonly initializer?: CsharpExpression;
}

export interface CsharpPropertyDeclaration {
  readonly kind: "PropertyDeclaration";
  readonly explicitInterface?: CsharpTypeNode;
  readonly name: string;
  readonly modifiers: readonly CsharpModifier[];
  readonly attributes?: readonly CsharpAttribute[];
  readonly type: CsharpTypeNode;
  readonly initializer?: CsharpExpression;
  readonly autoGetter?: boolean;
  readonly autoSetter?: boolean;
  readonly autoSetterModifiers?: readonly CsharpAccessorModifier[];
  readonly getterModifiers?: readonly CsharpAccessorModifier[];
  readonly setterModifiers?: readonly CsharpAccessorModifier[];
  readonly getter?: CsharpBlock;
  readonly setter?: CsharpBlock;
}

export type CsharpAccessorModifier =
  | "private"
  | "protected"
  | "internal"
  | "safe"
  | "unsafe";

export interface CsharpParameter {
  readonly name: string;
  readonly type: CsharpTypeNode;
  readonly attributes?: readonly CsharpAttribute[];
  readonly passing?: "in" | "out" | "ref";
  readonly isParams?: boolean;
  readonly defaultValue?: CsharpExpression;
}

export interface CsharpAttribute {
  readonly targetSpecifier?: CsharpAttributeTargetSpecifier;
  readonly type: CsharpTypeNode;
  readonly arguments?: readonly CsharpArgument[];
}

export type CsharpAttributeTargetSpecifier = "field" | "property" | "param" | "return";

export type CsharpModifier = "public" | "internal" | "private" | "protected" | "static" | "readonly" | "required" | "abstract" | "virtual" | "override" | "new" | "async" | "safe" | "unsafe";

export interface CsharpBlock {
  readonly kind: "Block";
  readonly statements: readonly CsharpStatement[];
}

export type CsharpStatement =
  | { readonly kind: "ReturnStatement"; readonly expression?: CsharpExpression; readonly ref?: true }
  | { readonly kind: "YieldReturnStatement"; readonly expression: CsharpExpression }
  | { readonly kind: "YieldBreakStatement" }
  | { readonly kind: "ExpressionStatement"; readonly expression: CsharpExpression }
  | { readonly kind: "LocalDeclarationStatement"; readonly name: string; readonly type: CsharpTypeNode; readonly initializer?: CsharpExpression; readonly refKind?: CsharpLocalRefKind }
  | { readonly kind: "Block"; readonly body: CsharpBlock }
  | { readonly kind: "UnsafeStatement"; readonly body: CsharpBlock }
  | { readonly kind: "BreakStatement" }
  | { readonly kind: "ContinueStatement" }
  | { readonly kind: "GotoStatement"; readonly label: string }
  | { readonly kind: "GotoSwitchStatement"; readonly label: CsharpSwitchLabel }
  | { readonly kind: "ThrowStatement"; readonly expression?: CsharpExpression }
  | { readonly kind: "LabeledStatement"; readonly name: string; readonly statement: CsharpStatement }
  | { readonly kind: "SwitchStatement"; readonly expression: CsharpExpression; readonly sections: readonly CsharpSwitchSection[] }
  | { readonly kind: "TryStatement"; readonly tryBody: CsharpBlock; readonly catchClause?: CsharpCatchClause; readonly finallyBody?: CsharpBlock }
  | { readonly kind: "ForEachStatement"; readonly await?: boolean; readonly itemType: CsharpTypeNode; readonly itemName: string; readonly collection: CsharpExpression; readonly body: CsharpBlock }
  | {
      readonly kind: "LocalFunctionStatement";
      readonly shadowsEnclosingTypeParameter?: true;
      readonly name: string;
      readonly modifiers: readonly CsharpModifier[];
      readonly attributes?: readonly CsharpAttribute[];
      readonly typeParameters?: readonly CsharpTypeParameter[];
      readonly returnType: CsharpTypeNode;
      readonly parameters: readonly CsharpParameter[];
      readonly body: CsharpBlock;
    }
  | { readonly kind: "IfStatement"; readonly condition: CsharpExpression; readonly thenBody: CsharpBlock; readonly elseBody?: CsharpBlock }
  | { readonly kind: "WhileStatement"; readonly condition: CsharpExpression; readonly body: CsharpBlock }
  | { readonly kind: "DoStatement"; readonly body: CsharpBlock; readonly condition: CsharpExpression }
  | {
      readonly kind: "ForStatement";
      readonly initializer?: CsharpForInitializer;
      readonly condition?: CsharpExpression;
      readonly incrementors?: readonly CsharpExpression[];
      readonly unreachableIncrementor?: true;
      readonly body: CsharpBlock;
    };

export interface CsharpSwitchSection {
  readonly kind: "SwitchSection";
  readonly label: CsharpSwitchLabel;
  readonly statements: readonly CsharpStatement[];
}

export type CsharpSwitchLabel =
  | { readonly kind: "CaseSwitchLabel"; readonly expression: CsharpExpression }
  | { readonly kind: "DefaultSwitchLabel" };

export type CsharpCatchClause =
  | {
      readonly kind: "CatchClause";
      readonly body: CsharpBlock;
      readonly variableName?: never;
      readonly variableType?: never;
    }
  | {
      readonly kind: "CatchClause";
      readonly variableName: string;
      readonly variableType: CsharpTypeNode;
      readonly body: CsharpBlock;
    };

export type CsharpForInitializer =
  | { readonly kind: "VariableDeclaration"; readonly locals: readonly CsharpLocalDeclaration[] }
  | { readonly kind: "Expression"; readonly expression: CsharpExpression };

export interface CsharpLocalDeclaration {
  readonly kind: "VariableDeclarator";
  readonly name: string;
  readonly type: CsharpTypeNode;
  readonly initializer?: CsharpExpression;
  readonly refKind?: CsharpLocalRefKind;
}

export type CsharpLocalRefKind = "ref" | "ref-readonly";
