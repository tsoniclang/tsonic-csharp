import type {
  ProviderMemberDeclaration,
  ProviderParameterDeclaration,
  ProviderSignatureDeclaration,
  ProviderTypeExpression,
  ProviderTypeParameterDeclaration,
} from "@tsonic/tsts";
import type { DotnetTypeDeclaration } from "../model.js";

export function getBaseTypeParameterSubstitutions(
  baseDeclaration: DotnetTypeDeclaration,
  baseType: Extract<ProviderTypeExpression, { readonly kind: "provider-ref" }>,
): ReadonlyMap<string, ProviderTypeExpression> {
  const substitutions = new Map<string, ProviderTypeExpression>();
  const typeParameters = baseDeclaration.typeParameters ?? [];
  const typeArguments = baseType.typeArguments ?? [];
  for (let index = 0; index < typeParameters.length && index < typeArguments.length; index++) {
    substitutions.set(typeParameters[index]!.name, typeArguments[index]!);
  }
  return substitutions;
}

export function substituteProviderMember(
  member: ProviderMemberDeclaration,
  substitutions: ReadonlyMap<string, ProviderTypeExpression>,
): ProviderMemberDeclaration {
  return {
    ...member,
    ...(member.type === undefined ? {} : { type: substituteProviderTypeExpression(member.type, substitutions) }),
    ...(member.signatures === undefined ? {} : { signatures: member.signatures.map((signature) => substituteProviderSignature(signature, substitutions)) }),
  };
}

function substituteProviderSignature(
  signature: ProviderSignatureDeclaration,
  substitutions: ReadonlyMap<string, ProviderTypeExpression>,
): ProviderSignatureDeclaration {
  const scopedSubstitutions = removeScopedTypeParameters(substitutions, signature.typeParameters);
  return {
    ...signature,
    parameters: signature.parameters.map((parameter) => substituteProviderParameter(parameter, scopedSubstitutions)),
    ...(signature.returnType === undefined ? {} : { returnType: substituteProviderTypeExpression(signature.returnType, scopedSubstitutions) }),
  };
}

function substituteProviderParameter(
  parameter: ProviderParameterDeclaration,
  substitutions: ReadonlyMap<string, ProviderTypeExpression>,
): ProviderParameterDeclaration {
  return {
    ...parameter,
    type: substituteProviderTypeExpression(parameter.type, substitutions),
  };
}

function substituteProviderTypeExpression(
  type: ProviderTypeExpression,
  substitutions: ReadonlyMap<string, ProviderTypeExpression>,
): ProviderTypeExpression {
  switch (type.kind) {
    case "type-parameter":
      return substitutions.get(type.name) ?? type;
    case "provider-ref":
      return {
        ...type,
        ...(type.typeArguments === undefined ? {} : { typeArguments: type.typeArguments.map((argument) => substituteProviderTypeExpression(argument, substitutions)) }),
      };
    case "target-named":
      return {
        ...type,
        ...(type.typeArguments === undefined ? {} : { typeArguments: type.typeArguments.map((argument) => substituteProviderTypeExpression(argument, substitutions)) }),
        ...(type.sourceShape === undefined ? {} : { sourceShape: substituteProviderTypeExpression(type.sourceShape, substitutions) }),
      };
    case "array":
      return { ...type, elementType: substituteProviderTypeExpression(type.elementType, substitutions) };
    case "tuple":
      return { ...type, elementTypes: type.elementTypes.map((elementType) => substituteProviderTypeExpression(elementType, substitutions)) };
    case "union":
    case "intersection":
      return { ...type, types: type.types.map((nestedType) => substituteProviderTypeExpression(nestedType, substitutions)) };
    case "function": {
      const scopedSubstitutions = removeScopedTypeParameters(substitutions, type.typeParameters);
      return {
        ...type,
        parameters: type.parameters.map((parameter) => substituteProviderParameter(parameter, scopedSubstitutions)),
        returnType: substituteProviderTypeExpression(type.returnType, scopedSubstitutions),
      };
    }
    case "opaque":
      return type.sourceShape === undefined
        ? type
        : { ...type, sourceShape: substituteProviderTypeExpression(type.sourceShape, substitutions) };
    default:
      return type;
  }
}

function removeScopedTypeParameters(
  substitutions: ReadonlyMap<string, ProviderTypeExpression>,
  typeParameters: readonly ProviderTypeParameterDeclaration[] | undefined,
): ReadonlyMap<string, ProviderTypeExpression> {
  if (typeParameters === undefined || typeParameters.length === 0) {
    return substitutions;
  }
  const scoped = new Map(substitutions);
  for (const typeParameter of typeParameters) {
    scoped.delete(typeParameter.name);
  }
  return scoped;
}
