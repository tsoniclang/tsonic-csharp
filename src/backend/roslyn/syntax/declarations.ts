import type { CsharpExpression } from "./expressions.js";
import type {
  CsharpAttribute,
  CsharpInterfaceMember,
  CsharpModifier,
  CsharpTypeMember,
  CsharpTypeParameter,
} from "./members.js";
import type { CsharpTypeNode } from "./types.js";

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
