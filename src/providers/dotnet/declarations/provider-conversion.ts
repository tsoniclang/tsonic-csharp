import type {
  ProviderParameterDeclaration,
  ProviderTypeExpression,
  ProviderTypeParameterDeclaration,
} from "@tsonic/tsts";
import type {
  DotnetTypeParameterDeclaration,
  DotnetTypeRef,
} from "../model/types.js";

export function dotnetTypeRefToProviderType(
  type: DotnetTypeRef,
  identityPath = "$",
): ProviderTypeExpression {
  const providerType = tryDotnetTypeRefToProviderType(type, identityPath);
  if (providerType === undefined) {
    throw unsupportedDotnetProviderType(type.kind);
  }
  return providerType;
}

export function tryDotnetTypeRefToProviderType(
  type: DotnetTypeRef,
  identityPath = "$",
): ProviderTypeExpression | undefined {
  switch (type.kind) {
    case "void":
    case "any":
    case "unknown":
    case "undefined":
    case "object":
    case "string":
    case "boolean":
    case "number":
    case "bigint":
      return { kind: type.kind };
    case "literal":
      return { kind: "literal", value: type.value };
    case "source-primitive":
      return { kind: "source-primitive", name: type.name };
    case "type-parameter":
      return { kind: "type-parameter", name: type.name };
    case "provider-ref": {
      const moduleSpecifier = providerRefString(type.moduleSpecifier);
      const exportName = providerRefString(type.exportName);
      if (moduleSpecifier === undefined || exportName === undefined) {
        return undefined;
      }
      const typeArguments = mapDotnetProviderTypes(type.typeArguments, `${identityPath}.typeArguments`);
      if (typeArguments === undefined) {
        return undefined;
      }
      return {
        kind: "provider-ref",
        moduleSpecifier,
        exportName,
        ...(typeArguments.length > 0 ? { typeArguments } : {}),
      };
    }
    case "named": {
      if (type.sourceShape === undefined) {
        return undefined;
      }
      return tryDotnetTypeRefToProviderType(type.sourceShape, `${identityPath}.sourceShape`);
    }
    case "array": {
      if (type.rank !== undefined && type.rank !== 1) {
        return undefined;
      }
      const elementType = tryDotnetTypeRefToProviderType(type.elementType, `${identityPath}.elementType`);
      return elementType === undefined ? undefined : { kind: "array", elementType };
    }
    case "nullable": {
      const elementType = tryDotnetTypeRefToProviderType(type.elementType, `${identityPath}.elementType`);
      return elementType === undefined
        ? undefined
        : { kind: "union", types: [elementType, { kind: "literal", value: null }] };
    }
    case "nullable-reference": {
      const elementType = tryDotnetTypeRefToProviderType(
        type.elementType,
        `${identityPath}.elementType`,
      );
      return elementType === undefined
        ? undefined
        : { kind: "union", types: [elementType, { kind: "undefined" }] };
    }
    case "tuple": {
      const elementTypes = mapDotnetProviderTypes(type.elements, `${identityPath}.elements`);
      return elementTypes === undefined ? undefined : { kind: "tuple", elementTypes };
    }
    case "union": {
      const types = mapDotnetProviderTypes(type.types, `${identityPath}.types`);
      return types === undefined ? undefined : { kind: "union", types };
    }
    case "function": {
      if (typeof type.id !== "string" || type.id.length === 0) {
        return undefined;
      }
      const parameters = type.parameters.map((parameter, index) =>
        tryDotnetParameterToProviderParameter(parameter, `${identityPath}.parameters[${index}]`));
      const returnType = tryDotnetTypeRefToProviderType(type.returnType, `${identityPath}.returnType`);
      if (parameters.some((parameter) => parameter === undefined) || returnType === undefined) {
        return undefined;
      }
      return {
        kind: "function",
        id: JSON.stringify([identityPath, type.id]),
        parameters: parameters as NonNullable<(typeof parameters)[number]>[],
        returnType,
        ...(type.typeParameters !== undefined
          ? {
            typeParameters: type.typeParameters.map((parameter, index) =>
              dotnetTypeParameterToProviderTypeParameter(parameter, `${identityPath}.typeParameters[${index}]`)),
          }
          : {}),
      };
    }
    case "pointer":
    case "function-pointer":
      return undefined;
    case "opaque": {
      if (type.sourceShape === undefined) {
        return undefined;
      }
      return tryDotnetTypeRefToProviderType(type.sourceShape, `${identityPath}.sourceShape`);
    }
  }
}

export function dotnetTypeParameterToProviderTypeParameter(
  typeParameter: DotnetTypeParameterDeclaration,
  identityPath = "$",
): ProviderTypeParameterDeclaration {
  const defaultType = typeParameter.defaultType === undefined
    ? undefined
    : tryDotnetTypeRefToProviderType(typeParameter.defaultType, `${identityPath}.defaultType`);
  const variance = typeParameter.variance === "target-defined"
    ? undefined
    : typeParameter.variance;
  return {
    name: typeParameter.name,
    ...(variance !== undefined ? { variance } : {}),
    ...(defaultType !== undefined ? { defaultType } : {}),
  };
}

function unsupportedDotnetProviderType(kind: DotnetTypeRef["kind"]): Error {
  return new Error(`Unsupported .NET provider type '${kind}'. Add a typed TSTS provider type expression before exposing this declaration.`);
}

function tryDotnetParameterToProviderParameter(
  parameter: Extract<DotnetTypeRef, { readonly kind: "function" }>["parameters"][number],
  identityPath: string,
): ProviderParameterDeclaration | undefined {
  const type = tryDotnetTypeRefToProviderType(parameter.sourceType ?? parameter.type, `${identityPath}.type`);
  return type === undefined
    ? undefined
    : {
        name: parameter.name,
        type,
        ...(parameter.passingMode !== "by-value" ? { passingMode: parameter.passingMode } : {}),
        ...(parameter.optional === true ? { optional: true as const } : {}),
        ...(parameter.rest === true ? { rest: true as const } : {}),
      };
}

function mapDotnetProviderTypes(
  types: readonly DotnetTypeRef[] | undefined,
  identityPath: string,
): readonly ProviderTypeExpression[] | undefined {
  if (types === undefined) {
    return [];
  }
  const mapped = types.map((type, index) => tryDotnetTypeRefToProviderType(type, `${identityPath}[${index}]`));
  return mapped.some((type) => type === undefined)
    ? undefined
    : mapped as readonly ProviderTypeExpression[];
}

function providerRefString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
