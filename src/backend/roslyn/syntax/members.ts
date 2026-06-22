import type { CsharpArgument, CsharpExpression } from "./expressions.js";
import type { CsharpBlock } from "./statements.js";
import type { CsharpTypeNode } from "./types.js";

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
  readonly constraints?: readonly CsharpGenericConstraint[];
}

export type CsharpGenericConstraint =
  | { readonly kind: "TypeConstraint"; readonly type: CsharpTypeNode }
  | { readonly kind: "KeywordConstraint"; readonly keyword: "class" | "struct" | "notnull" | "unmanaged" }
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
  readonly name: string;
  readonly modifiers: readonly CsharpModifier[];
  readonly attributes?: readonly CsharpAttribute[];
  readonly type: CsharpTypeNode;
  readonly initializer?: CsharpExpression;
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
  readonly targetSpecifier?: CsharpAttributeTargetSpecifier;
  readonly type: CsharpTypeNode;
  readonly arguments?: readonly CsharpArgument[];
}

export type CsharpAttributeTargetSpecifier = "field" | "property" | "param" | "return";

export type CsharpModifier = "public" | "internal" | "private" | "static" | "readonly" | "virtual" | "override" | "async" | "unsafe";
