import type {
  CsharpConstructorDeclaration,
  CsharpInterfaceMember,
  CsharpMember,
  CsharpTypeDeclaration,
  CsharpTypeMember,
} from "../roslyn/syntax.js";
import {
  csharpTypeRequiresUnsafe,
} from "./target-types.js";
import {
  argumentRequiresUnsafe,
  optionalExpressionRequiresUnsafe,
} from "./unsafe-expressions.js";
import {
  blockRequiresUnsafe,
  optionalBlockRequiresUnsafe,
} from "./unsafe-statements.js";
import {
  optionalTypeRequiresUnsafe,
  parameterRequiresUnsafe,
  typeParametersRequireUnsafe,
} from "./unsafe-type-members.js";

export function memberRequiresUnsafe(member: CsharpMember): boolean {
  return member.kind === "NamespaceDeclaration"
    ? member.members.some(typeDeclarationRequiresUnsafe)
    : typeDeclarationRequiresUnsafe(member);
}

function typeDeclarationRequiresUnsafe(declaration: CsharpTypeDeclaration): boolean {
  switch (declaration.kind) {
    case "ClassDeclaration":
      return optionalTypeRequiresUnsafe(declaration.baseType) ||
        (declaration.interfaces ?? []).some(csharpTypeRequiresUnsafe) ||
        typeParametersRequireUnsafe(declaration.typeParameters) ||
        declaration.members.some(typeMemberRequiresUnsafe);
    case "StructDeclaration":
      return (declaration.interfaces ?? []).some(csharpTypeRequiresUnsafe) ||
        typeParametersRequireUnsafe(declaration.typeParameters) ||
        declaration.members.some(typeMemberRequiresUnsafe);
    case "InterfaceDeclaration":
      return (declaration.interfaces ?? []).some(csharpTypeRequiresUnsafe) ||
        typeParametersRequireUnsafe(declaration.typeParameters) ||
        declaration.members.some(interfaceMemberRequiresUnsafe);
    case "EnumDeclaration":
      return declaration.members.some((member) => optionalExpressionRequiresUnsafe(member.value, blockRequiresUnsafe));
  }
}

function typeMemberRequiresUnsafe(member: CsharpTypeMember): boolean {
  switch (member.kind) {
    case "ConstructorDeclaration":
      return constructorRequiresUnsafe(member);
    case "StaticConstructorDeclaration":
      return blockRequiresUnsafe(member.body);
    case "MethodDeclaration":
      return csharpTypeRequiresUnsafe(member.returnType) ||
        typeParametersRequireUnsafe(member.typeParameters) ||
        member.parameters.some((parameter) => parameterRequiresUnsafe(parameter, (expression) => optionalExpressionRequiresUnsafe(expression, blockRequiresUnsafe))) ||
        blockRequiresUnsafe(member.body);
    case "FieldDeclaration":
      return csharpTypeRequiresUnsafe(member.type) || optionalExpressionRequiresUnsafe(member.initializer, blockRequiresUnsafe);
    case "PropertyDeclaration":
      return csharpTypeRequiresUnsafe(member.type) ||
        optionalBlockRequiresUnsafe(member.getter) ||
        optionalBlockRequiresUnsafe(member.setter);
  }
}

function constructorRequiresUnsafe(member: CsharpConstructorDeclaration): boolean {
  return member.parameters.some((parameter) => parameterRequiresUnsafe(parameter, (expression) => optionalExpressionRequiresUnsafe(expression, blockRequiresUnsafe))) ||
    (member.baseArguments ?? []).some((argument) => argumentRequiresUnsafe(argument, blockRequiresUnsafe)) ||
    blockRequiresUnsafe(member.body);
}

function interfaceMemberRequiresUnsafe(member: CsharpInterfaceMember): boolean {
  switch (member.kind) {
    case "MethodDeclaration":
      return csharpTypeRequiresUnsafe(member.returnType) ||
        typeParametersRequireUnsafe(member.typeParameters) ||
        member.parameters.some((parameter) => parameterRequiresUnsafe(parameter, (expression) => optionalExpressionRequiresUnsafe(expression, blockRequiresUnsafe)));
    case "PropertyDeclaration":
      return csharpTypeRequiresUnsafe(member.type);
    case "IndexerDeclaration":
      return csharpTypeRequiresUnsafe(member.keyType) || csharpTypeRequiresUnsafe(member.valueType);
  }
}
