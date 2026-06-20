export interface CsharpCompilationUnit {
  readonly kind: "CompilationUnit";
  readonly usings: readonly CsharpUsing[];
  readonly members: readonly CsharpMember[];
}

export interface CsharpUsing {
  readonly kind: "UsingDirective";
  readonly namespace: string;
}

export type CsharpMember = CsharpNamespace | CsharpTypeDeclaration;

export interface CsharpNamespace {
  readonly kind: "NamespaceDeclaration";
  readonly name: string;
  readonly members: readonly CsharpTypeDeclaration[];
}

export type CsharpTypeDeclaration = CsharpClassDeclaration | CsharpStructDeclaration | CsharpInterfaceDeclaration | CsharpEnumDeclaration;

export interface CsharpClassDeclaration {
  readonly kind: "ClassDeclaration";
  readonly name: string;
  readonly modifiers: readonly CsharpModifier[];
  readonly attributes?: readonly CsharpAttribute[];
  readonly typeParameters?: readonly CsharpTypeParameter[];
  readonly baseType?: CsharpTypeNode;
  readonly interfaces?: readonly CsharpTypeNode[];
  readonly members: readonly CsharpTypeMember[];
}

export interface CsharpStructDeclaration {
  readonly kind: "StructDeclaration";
  readonly name: string;
  readonly modifiers: readonly CsharpModifier[];
  readonly attributes?: readonly CsharpAttribute[];
  readonly typeParameters?: readonly CsharpTypeParameter[];
  readonly interfaces?: readonly CsharpTypeNode[];
  readonly members: readonly CsharpTypeMember[];
}

export interface CsharpInterfaceDeclaration {
  readonly kind: "InterfaceDeclaration";
  readonly name: string;
  readonly modifiers: readonly CsharpModifier[];
  readonly attributes?: readonly CsharpAttribute[];
  readonly typeParameters?: readonly CsharpTypeParameter[];
  readonly interfaces?: readonly CsharpTypeNode[];
  readonly members: readonly CsharpInterfaceMember[];
}

export interface CsharpEnumDeclaration {
  readonly kind: "EnumDeclaration";
  readonly name: string;
  readonly modifiers: readonly CsharpModifier[];
  readonly attributes?: readonly CsharpAttribute[];
  readonly members: readonly CsharpEnumMember[];
}

export interface CsharpEnumMember {
  readonly kind: "EnumMemberDeclaration";
  readonly name: string;
  readonly value?: CsharpExpression;
}

export type CsharpTypeMember =
  | CsharpConstructorDeclaration
  | CsharpMethodDeclaration
  | CsharpFieldDeclaration
  | CsharpPropertyDeclaration;

export type CsharpInterfaceMember =
  | CsharpInterfaceMethodDeclaration
  | CsharpInterfacePropertyDeclaration
  | CsharpInterfaceIndexerDeclaration;

export interface CsharpInterfaceMethodDeclaration {
  readonly kind: "MethodDeclaration";
  readonly name: string;
  readonly attributes?: readonly CsharpAttribute[];
  readonly typeParameters?: readonly CsharpTypeParameter[];
  readonly returnType: CsharpTypeNode;
  readonly parameters: readonly CsharpParameter[];
}

export interface CsharpInterfacePropertyDeclaration {
  readonly kind: "PropertyDeclaration";
  readonly name: string;
  readonly attributes?: readonly CsharpAttribute[];
  readonly type: CsharpTypeNode;
}

export interface CsharpInterfaceIndexerDeclaration {
  readonly kind: "IndexerDeclaration";
  readonly attributes?: readonly CsharpAttribute[];
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
  readonly baseArguments?: readonly CsharpArgument[];
  readonly body: CsharpBlock;
}

export interface CsharpMethodDeclaration {
  readonly kind: "MethodDeclaration";
  readonly name: string;
  readonly modifiers: readonly CsharpModifier[];
  readonly attributes?: readonly CsharpAttribute[];
  readonly typeParameters?: readonly CsharpTypeParameter[];
  readonly returnType: CsharpTypeNode;
  readonly parameters: readonly CsharpParameter[];
  readonly body: CsharpBlock;
}

export interface CsharpTypeParameter {
  readonly name: string;
  readonly constraints?: readonly CsharpTypeNode[];
}

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
  readonly name: string;
  readonly modifiers: readonly CsharpModifier[];
  readonly attributes?: readonly CsharpAttribute[];
  readonly type: CsharpTypeNode;
  readonly autoGetter?: boolean;
  readonly autoSetter?: boolean;
  readonly getter?: CsharpBlock;
  readonly setter?: CsharpBlock;
}

export interface CsharpParameter {
  readonly name: string;
  readonly type: CsharpTypeNode;
  readonly attributes?: readonly CsharpAttribute[];
  readonly passing?: "in" | "out" | "ref";
  readonly isParams?: boolean;
  readonly defaultValue?: CsharpExpression;
}

export interface CsharpAttribute {
  readonly type: CsharpTypeNode;
  readonly arguments?: readonly CsharpArgument[];
}

export type CsharpModifier = "public" | "internal" | "private" | "static" | "readonly" | "async" | "unsafe";

export type CsharpTypeNode =
  | { readonly kind: "PredefinedType"; readonly name: string }
  | { readonly kind: "InvalidType"; readonly reason: string }
  | { readonly kind: "IdentifierName"; readonly name: string; readonly typeArguments?: readonly CsharpTypeNode[] }
  | { readonly kind: "QualifiedName"; readonly left: CsharpTypeNode; readonly name: string; readonly typeArguments?: readonly CsharpTypeNode[] }
  | { readonly kind: "ArrayType"; readonly elementType: CsharpTypeNode; readonly rank?: number }
  | { readonly kind: "TupleType"; readonly elements: readonly CsharpTypeNode[] }
  | { readonly kind: "PointerType"; readonly pointee: CsharpTypeNode }
  | { readonly kind: "FunctionPointerType"; readonly parameters: readonly CsharpTypeNode[]; readonly returnType: CsharpTypeNode }
  | { readonly kind: "NullableType"; readonly inner: CsharpTypeNode };

export interface CsharpBlock {
  readonly kind: "Block";
  readonly statements: readonly CsharpStatement[];
}

export type CsharpStatement =
  | { readonly kind: "ReturnStatement"; readonly expression?: CsharpExpression }
  | { readonly kind: "ExpressionStatement"; readonly expression: CsharpExpression }
  | { readonly kind: "LocalDeclarationStatement"; readonly name: string; readonly type: CsharpTypeNode; readonly initializer?: CsharpExpression }
  | { readonly kind: "Block"; readonly body: CsharpBlock }
  | { readonly kind: "BreakStatement" }
  | { readonly kind: "ContinueStatement" }
  | { readonly kind: "GotoStatement"; readonly label: string }
  | { readonly kind: "GotoSwitchStatement"; readonly label: CsharpSwitchLabel }
  | { readonly kind: "ThrowStatement"; readonly expression: CsharpExpression }
  | { readonly kind: "LabeledStatement"; readonly name: string; readonly statement: CsharpStatement }
  | { readonly kind: "SwitchStatement"; readonly expression: CsharpExpression; readonly sections: readonly CsharpSwitchSection[] }
  | { readonly kind: "TryStatement"; readonly tryBody: CsharpBlock; readonly catchClause?: CsharpCatchClause; readonly finallyBody?: CsharpBlock }
  | { readonly kind: "ForEachStatement"; readonly itemType: CsharpTypeNode; readonly itemName: string; readonly collection: CsharpExpression; readonly body: CsharpBlock }
  | { readonly kind: "IfStatement"; readonly condition: CsharpExpression; readonly thenBody: CsharpBlock; readonly elseBody?: CsharpBlock }
  | { readonly kind: "WhileStatement"; readonly condition: CsharpExpression; readonly body: CsharpBlock }
  | { readonly kind: "DoStatement"; readonly body: CsharpBlock; readonly condition: CsharpExpression }
  | {
      readonly kind: "ForStatement";
      readonly initializer?: CsharpForInitializer;
      readonly condition?: CsharpExpression;
      readonly incrementor?: CsharpExpression;
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

export interface CsharpCatchClause {
  readonly kind: "CatchClause";
  readonly variableType?: CsharpTypeNode;
  readonly variableName?: string;
  readonly body: CsharpBlock;
}

export type CsharpForInitializer =
  | { readonly kind: "VariableDeclaration"; readonly locals: readonly CsharpLocalDeclaration[] }
  | { readonly kind: "Expression"; readonly expression: CsharpExpression };

export interface CsharpLocalDeclaration {
  readonly kind: "VariableDeclarator";
  readonly name: string;
  readonly type: CsharpTypeNode;
  readonly initializer?: CsharpExpression;
}

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
