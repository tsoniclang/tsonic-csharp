import type {
  ProviderExportDeclaration,
  ProviderImportDeclaration,
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
        const localName = type.moduleSpecifier === context.moduleSpecifier
          ? type.localName
          : generatedProviderRefLocalName(type.moduleSpecifier, type.exportName);
        return {
          ...type,
          ...(localName === undefined ? {} : { localName }),
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

export function providerImportsForExternalRefs(
  declarations: readonly ProviderExportDeclaration[],
  currentModuleSpecifier: string,
): readonly ProviderImportDeclaration[] {
  const importsByModule = new Map<string, Map<string, string | undefined>>();
  for (const declaration of declarations) {
    collectProviderImportsFromExport(declaration, currentModuleSpecifier, importsByModule);
  }
  return [...importsByModule.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([moduleSpecifier, imports]) => ({
      moduleSpecifier,
      typeOnly: true,
      namedImports: [...imports.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([exportedName, localName]) => ({
          exportedName,
          ...(localName === undefined || localName === exportedName ? {} : { localName }),
          kind: "type" as const,
        })),
    }));
}

function collectProviderImportsFromExport(
  declaration: ProviderExportDeclaration,
  currentModuleSpecifier: string,
  importsByModule: Map<string, Map<string, string | undefined>>,
): void {
  collectProviderImportsFromType(declaration.type, currentModuleSpecifier, importsByModule);
  for (const heritage of declaration.heritage ?? []) {
    collectProviderImportsFromType(heritage.type, currentModuleSpecifier, importsByModule);
  }
  for (const signature of declaration.signatures ?? []) {
    collectProviderImportsFromSignature(signature, currentModuleSpecifier, importsByModule);
  }
  for (const member of declaration.members ?? []) {
    collectProviderImportsFromType(member.type, currentModuleSpecifier, importsByModule);
    for (const signature of member.signatures ?? []) {
      collectProviderImportsFromSignature(signature, currentModuleSpecifier, importsByModule);
    }
  }
}

function collectProviderImportsFromSignature(
  signature: ProviderSignatureDeclaration,
  currentModuleSpecifier: string,
  importsByModule: Map<string, Map<string, string | undefined>>,
): void {
  for (const parameter of signature.parameters) {
    collectProviderImportsFromType(parameter.type, currentModuleSpecifier, importsByModule);
  }
  collectProviderImportsFromType(signature.returnType, currentModuleSpecifier, importsByModule);
  for (const typeParameter of signature.typeParameters ?? []) {
    collectProviderImportsFromType(typeParameter.defaultType, currentModuleSpecifier, importsByModule);
    for (const constraint of typeParameter.constraints ?? []) {
      collectProviderImportsFromType(constraint, currentModuleSpecifier, importsByModule);
    }
  }
}

function collectProviderImportsFromType(
  type: ProviderTypeExpression | undefined,
  currentModuleSpecifier: string,
  importsByModule: Map<string, Map<string, string | undefined>>,
): void {
  if (type === undefined) {
    return;
  }
  switch (type.kind) {
    case "provider-ref":
      if (type.moduleSpecifier !== currentModuleSpecifier) {
        const imports = importsByModule.get(type.moduleSpecifier) ?? new Map<string, string | undefined>();
        imports.set(type.exportName, type.localName);
        importsByModule.set(type.moduleSpecifier, imports);
      }
      for (const argument of type.typeArguments ?? []) {
        collectProviderImportsFromType(argument, currentModuleSpecifier, importsByModule);
      }
      return;
    case "target-named":
      for (const argument of type.typeArguments ?? []) {
        collectProviderImportsFromType(argument, currentModuleSpecifier, importsByModule);
      }
      collectProviderImportsFromType(type.sourceShape, currentModuleSpecifier, importsByModule);
      return;
    case "array":
      collectProviderImportsFromType(type.elementType, currentModuleSpecifier, importsByModule);
      return;
    case "tuple":
      for (const elementType of type.elementTypes) {
        collectProviderImportsFromType(elementType, currentModuleSpecifier, importsByModule);
      }
      return;
    case "union":
    case "intersection":
      for (const nestedType of type.types) {
        collectProviderImportsFromType(nestedType, currentModuleSpecifier, importsByModule);
      }
      return;
    case "function":
      for (const parameter of type.parameters) {
        collectProviderImportsFromType(parameter.type, currentModuleSpecifier, importsByModule);
      }
      collectProviderImportsFromType(type.returnType, currentModuleSpecifier, importsByModule);
      for (const typeParameter of type.typeParameters ?? []) {
        collectProviderImportsFromType(typeParameter.defaultType, currentModuleSpecifier, importsByModule);
        for (const constraint of typeParameter.constraints ?? []) {
          collectProviderImportsFromType(constraint, currentModuleSpecifier, importsByModule);
        }
      }
      return;
    case "opaque":
      collectProviderImportsFromType(type.sourceShape, currentModuleSpecifier, importsByModule);
      return;
    default:
      return;
  }
}

function generatedProviderRefLocalName(moduleSpecifier: string, exportName: string): string {
  return `__TsonicDotnet_${sanitizeIdentifierPart(exportName)}_${stableIdentifierHash(moduleSpecifier)}`;
}

function sanitizeIdentifierPart(value: string): string {
  const sanitized = value.replace(/[^A-Za-z0-9_$]/gu, "_");
  return /^[A-Za-z_$]/u.test(sanitized) ? sanitized : `_${sanitized}`;
}

function stableIdentifierHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(36);
}
