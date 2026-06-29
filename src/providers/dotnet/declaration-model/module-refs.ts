import type {
  ProviderExportDeclaration,
  ProviderMemberDeclaration,
  ProviderParameterDeclaration,
  ProviderSignatureDeclaration,
  ProviderTypeExpression,
} from "@tsonic/tsts";
import type { DotnetDeclarationContext } from "./context.js";
import { dotnetModuleExportsSourceName } from "./context.js";

export function qualifyProviderMemberModuleRefs(
  member: ProviderMemberDeclaration,
  moduleSpecifier: string,
  context: DotnetDeclarationContext,
): ProviderMemberDeclaration {
  return {
    ...member,
    ...(member.type === undefined ? {} : { type: qualifyProviderTypeModuleRefs(member.type, moduleSpecifier, context) }),
    ...(member.signatures === undefined ? {} : { signatures: member.signatures.map((signature) => qualifyProviderSignatureModuleRefs(signature, moduleSpecifier, context)) }),
  };
}

export function qualifyProviderExportModuleRefs(
  declaration: ProviderExportDeclaration,
  moduleSpecifier: string,
  context: DotnetDeclarationContext,
): ProviderExportDeclaration {
  return {
    ...declaration,
    ...(declaration.type === undefined ? {} : { type: qualifyProviderTypeModuleRefs(declaration.type, moduleSpecifier, context) }),
    ...(declaration.heritage === undefined ? {} : { heritage: declaration.heritage.map((heritage) => ({ ...heritage, type: qualifyProviderTypeModuleRefs(heritage.type, moduleSpecifier, context) })) }),
    ...(declaration.signatures === undefined ? {} : { signatures: declaration.signatures.map((signature) => qualifyProviderSignatureModuleRefs(signature, moduleSpecifier, context)) }),
    ...(declaration.members === undefined ? {} : { members: declaration.members.map((member) => qualifyProviderMemberModuleRefs(member, moduleSpecifier, context)) }),
  };
}

function qualifyProviderSignatureModuleRefs(
  signature: ProviderSignatureDeclaration,
  moduleSpecifier: string,
  context: DotnetDeclarationContext,
): ProviderSignatureDeclaration {
  return {
    ...signature,
    parameters: signature.parameters.map((parameter) => qualifyProviderParameterModuleRefs(parameter, moduleSpecifier, context)),
    ...(signature.returnType === undefined ? {} : { returnType: qualifyProviderTypeModuleRefs(signature.returnType, moduleSpecifier, context) }),
  };
}

function qualifyProviderParameterModuleRefs(
  parameter: ProviderParameterDeclaration,
  moduleSpecifier: string,
  context: DotnetDeclarationContext,
): ProviderParameterDeclaration {
  return {
    ...parameter,
    type: qualifyProviderTypeModuleRefs(parameter.type, moduleSpecifier, context),
  };
}

function qualifyProviderTypeModuleRefs(
  type: ProviderTypeExpression,
  moduleSpecifier: string,
  context: DotnetDeclarationContext,
): ProviderTypeExpression {
  switch (type.kind) {
    case "provider-ref":
      {
        const declaredModuleSpecifier = dotnetModuleExportsSourceName(type.moduleSpecifier, type.exportName, context)
          ? type.moduleSpecifier
          : dotnetModuleExportsSourceName(moduleSpecifier, type.exportName, context)
            ? moduleSpecifier
            : dotnetModuleExportsSourceName(context.sourceModuleSpecifier, type.exportName, context)
              ? context.sourceModuleSpecifier
              : type.moduleSpecifier;
        const renderedModuleSpecifier = declaredModuleSpecifier === context.moduleSpecifier
          ? declaredModuleSpecifier
          : context.dependencyModuleSpecifier?.(declaredModuleSpecifier, type.exportName) ?? declaredModuleSpecifier;
        return {
          ...type,
          moduleSpecifier: renderedModuleSpecifier,
          ...(type.typeArguments === undefined ? {} : { typeArguments: type.typeArguments.map((argument) => qualifyProviderTypeModuleRefs(argument, declaredModuleSpecifier ?? moduleSpecifier, context)) }),
        };
      }
    case "target-named":
      return {
        ...type,
        ...(type.typeArguments === undefined ? {} : { typeArguments: type.typeArguments.map((argument) => qualifyProviderTypeModuleRefs(argument, moduleSpecifier, context)) }),
        ...(type.sourceShape === undefined ? {} : { sourceShape: qualifyProviderTypeModuleRefs(type.sourceShape, moduleSpecifier, context) }),
      };
    case "array":
      return { ...type, elementType: qualifyProviderTypeModuleRefs(type.elementType, moduleSpecifier, context) };
    case "tuple":
      return { ...type, elementTypes: type.elementTypes.map((elementType) => qualifyProviderTypeModuleRefs(elementType, moduleSpecifier, context)) };
    case "union":
    case "intersection":
      return { ...type, types: type.types.map((nestedType) => qualifyProviderTypeModuleRefs(nestedType, moduleSpecifier, context)) };
    case "function":
      return {
        ...type,
        parameters: type.parameters.map((parameter) => qualifyProviderParameterModuleRefs(parameter, moduleSpecifier, context)),
        returnType: qualifyProviderTypeModuleRefs(type.returnType, moduleSpecifier, context),
      };
    case "opaque":
      return type.sourceShape === undefined
        ? type
        : { ...type, sourceShape: qualifyProviderTypeModuleRefs(type.sourceShape, moduleSpecifier, context) };
    default:
      return type;
  }
}
