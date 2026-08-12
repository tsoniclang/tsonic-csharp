import type {
  CsharpAttribute,
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
  argumentRequiresUnsafePermission,
  optionalExpressionRequiresUnsafe,
  optionalExpressionRequiresUnsafePermission,
} from "./unsafe-expressions.js";
import {
  blockRequiresUnsafe,
  blockRequiresUnsafePermission,
  optionalBlockRequiresUnsafe,
} from "./unsafe-statements.js";
import {
  optionalTypeRequiresUnsafe,
  parameterRequiresUnsafe,
  typeParametersRequireUnsafe,
} from "./unsafe-type-members.js";

export function typeDeclarationHeaderRequiresUnsafe(
  declaration: CsharpTypeDeclaration,
): boolean {
  switch (declaration.kind) {
    case "ClassDeclaration":
      return optionalTypeRequiresUnsafe(declaration.baseType) ||
        (declaration.interfaces ?? []).some(csharpTypeRequiresUnsafe) ||
        typeParametersRequireUnsafe(declaration.typeParameters);
    case "StructDeclaration":
    case "InterfaceDeclaration":
      return (declaration.interfaces ?? []).some(csharpTypeRequiresUnsafe) ||
        typeParametersRequireUnsafe(declaration.typeParameters);
    case "EnumDeclaration":
      return false;
  }
}

export function typeMemberRequiresUnsafe(member: CsharpTypeMember): boolean {
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

export function interfaceMemberRequiresUnsafe(member: CsharpInterfaceMember): boolean {
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

export function memberRequiresUnsafePermission(member: CsharpMember): boolean {
  return member.kind === "NamespaceDeclaration"
    ? member.members.some(typeDeclarationRequiresUnsafePermission)
    : typeDeclarationRequiresUnsafePermission(member);
}

function typeDeclarationRequiresUnsafePermission(
  declaration: CsharpTypeDeclaration,
): boolean {
  if (
    modifiersRequireUnsafePermission(declaration.modifiers) ||
    attributesRequireUnsafePermission(declaration.attributes)
  ) {
    return true;
  }
  switch (declaration.kind) {
    case "ClassDeclaration":
    case "StructDeclaration":
      return declaration.members.some(typeMemberRequiresUnsafePermission);
    case "InterfaceDeclaration":
      return declaration.members.some(interfaceMemberRequiresUnsafePermission);
    case "EnumDeclaration":
      return declaration.members.some((member) =>
        optionalExpressionRequiresUnsafePermission(
          member.value,
          blockRequiresUnsafePermission,
        )
      );
  }
}

function typeMemberRequiresUnsafePermission(
  member: CsharpTypeMember,
): boolean {
  if (
    "modifiers" in member &&
    modifiersRequireUnsafePermission(member.modifiers)
  ) {
    return true;
  }
  if (
    "attributes" in member &&
    attributesRequireUnsafePermission(member.attributes)
  ) {
    return true;
  }
  switch (member.kind) {
    case "ConstructorDeclaration":
      return member.parameters.some((parameter) =>
        parameter.attributes?.some(attributeRequiresUnsafePermission) === true ||
        optionalExpressionRequiresUnsafePermission(
          parameter.defaultValue,
          blockRequiresUnsafePermission,
        )
      ) || (member.baseArguments ?? []).some((argument) =>
        argumentRequiresUnsafePermission(
          argument,
          blockRequiresUnsafePermission,
        )
      ) || blockRequiresUnsafePermission(member.body);
    case "StaticConstructorDeclaration":
      return blockRequiresUnsafePermission(member.body);
    case "MethodDeclaration":
      return member.parameters.some((parameter) =>
        parameter.attributes?.some(attributeRequiresUnsafePermission) === true ||
        optionalExpressionRequiresUnsafePermission(
          parameter.defaultValue,
          blockRequiresUnsafePermission,
        )
      ) || blockRequiresUnsafePermission(member.body);
    case "FieldDeclaration":
      return optionalExpressionRequiresUnsafePermission(
        member.initializer,
        blockRequiresUnsafePermission,
      );
    case "PropertyDeclaration":
      return modifiersRequireUnsafePermission(member.getterModifiers) ||
        modifiersRequireUnsafePermission(member.setterModifiers) ||
        modifiersRequireUnsafePermission(member.autoSetterModifiers) ||
        optionalExpressionRequiresUnsafePermission(
          member.initializer,
          blockRequiresUnsafePermission,
        ) || (member.getter !== undefined &&
          blockRequiresUnsafePermission(member.getter)) ||
        (member.setter !== undefined &&
          blockRequiresUnsafePermission(member.setter));
  }
}

function interfaceMemberRequiresUnsafePermission(
  member: CsharpInterfaceMember,
): boolean {
  if (
    modifiersRequireUnsafePermission(member.modifiers) ||
    attributesRequireUnsafePermission(member.attributes)
  ) {
    return true;
  }
  switch (member.kind) {
    case "MethodDeclaration":
      return member.parameters.some((parameter) =>
        parameter.attributes?.some(attributeRequiresUnsafePermission) === true ||
        optionalExpressionRequiresUnsafePermission(
          parameter.defaultValue,
          blockRequiresUnsafePermission,
        )
      );
    case "PropertyDeclaration":
    case "IndexerDeclaration":
      return modifiersRequireUnsafePermission(member.getterModifiers) ||
        modifiersRequireUnsafePermission(member.setterModifiers);
  }
}

function attributesRequireUnsafePermission(
  attributes: readonly CsharpAttribute[] | undefined,
): boolean {
  return attributes?.some(attributeRequiresUnsafePermission) === true;
}

function attributeRequiresUnsafePermission(attribute: CsharpAttribute): boolean {
  return attribute.arguments?.some((argument) =>
    argumentRequiresUnsafePermission(
      argument,
      blockRequiresUnsafePermission,
    )
  ) === true;
}

function modifiersRequireUnsafePermission(
  modifiers: readonly string[] | undefined,
): boolean {
  return modifiers?.includes("unsafe") === true;
}
