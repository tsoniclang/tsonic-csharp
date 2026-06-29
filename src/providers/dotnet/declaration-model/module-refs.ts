import type {
  ProviderExportDeclaration,
  ProviderMemberDeclaration,
  ProviderParameterDeclaration,
  ProviderSignatureDeclaration,
  ProviderTypeExpression,
} from "@tsonic/tsts";
import type { DotnetDeclarationContext } from "./context.js";

export function qualifyProviderMemberModuleRefs(
  member: ProviderMemberDeclaration,
  context: DotnetDeclarationContext,
): ProviderMemberDeclaration {
  return {
    ...member,
    ...(member.type === undefined ? {} : { type: qualifyProviderTypeModuleRefs(member.type, context) }),
    ...(member.signatures === undefined ? {} : { signatures: member.signatures.map((signature) => qualifyProviderSignatureModuleRefs(signature, context)) }),
  };
}

export function qualifyProviderExportModuleRefs(
  declaration: ProviderExportDeclaration,
  context: DotnetDeclarationContext,
): ProviderExportDeclaration {
  return {
    ...declaration,
    ...(declaration.type === undefined ? {} : { type: qualifyProviderTypeModuleRefs(declaration.type, context) }),
    ...(declaration.heritage === undefined ? {} : { heritage: declaration.heritage.map((heritage) => ({ ...heritage, type: qualifyProviderTypeModuleRefs(heritage.type, context) })) }),
    ...(declaration.signatures === undefined ? {} : { signatures: declaration.signatures.map((signature) => qualifyProviderSignatureModuleRefs(signature, context)) }),
    ...(declaration.members === undefined ? {} : { members: declaration.members.map((member) => qualifyProviderMemberModuleRefs(member, context)) }),
  };
}

function qualifyProviderSignatureModuleRefs(
  signature: ProviderSignatureDeclaration,
  context: DotnetDeclarationContext,
): ProviderSignatureDeclaration {
  return {
    ...signature,
    parameters: signature.parameters.map((parameter) => qualifyProviderParameterModuleRefs(parameter, context)),
    ...(signature.returnType === undefined ? {} : { returnType: qualifyProviderTypeModuleRefs(signature.returnType, context) }),
  };
}

function qualifyProviderParameterModuleRefs(
  parameter: ProviderParameterDeclaration,
  context: DotnetDeclarationContext,
): ProviderParameterDeclaration {
  return {
    ...parameter,
    type: qualifyProviderTypeModuleRefs(parameter.type, context),
  };
}

function qualifyProviderTypeModuleRefs(
  type: ProviderTypeExpression,
  context: DotnetDeclarationContext,
): ProviderTypeExpression {
  switch (type.kind) {
    case "provider-ref":
      {
        const renderedModuleSpecifier = type.moduleSpecifier === context.moduleSpecifier
          ? type.moduleSpecifier
          : context.dependencyModuleSpecifier?.(type.moduleSpecifier, type.exportName) ?? type.moduleSpecifier;
        return {
          ...type,
          moduleSpecifier: renderedModuleSpecifier,
          ...(type.typeArguments === undefined ? {} : { typeArguments: type.typeArguments.map((argument) => qualifyProviderTypeModuleRefs(argument, context)) }),
        };
      }
    case "target-named":
      return {
        ...type,
        ...(type.typeArguments === undefined ? {} : { typeArguments: type.typeArguments.map((argument) => qualifyProviderTypeModuleRefs(argument, context)) }),
        ...(type.sourceShape === undefined ? {} : { sourceShape: qualifyProviderTypeModuleRefs(type.sourceShape, context) }),
      };
    case "array":
      return { ...type, elementType: qualifyProviderTypeModuleRefs(type.elementType, context) };
    case "tuple":
      return { ...type, elementTypes: type.elementTypes.map((elementType) => qualifyProviderTypeModuleRefs(elementType, context)) };
    case "union":
    case "intersection":
      return { ...type, types: type.types.map((nestedType) => qualifyProviderTypeModuleRefs(nestedType, context)) };
    case "function":
      return {
        ...type,
        parameters: type.parameters.map((parameter) => qualifyProviderParameterModuleRefs(parameter, context)),
        returnType: qualifyProviderTypeModuleRefs(type.returnType, context),
      };
    case "opaque":
      return type.sourceShape === undefined
        ? type
        : { ...type, sourceShape: qualifyProviderTypeModuleRefs(type.sourceShape, context) };
    default:
      return type;
  }
}
