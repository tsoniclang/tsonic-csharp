import type {
  ProviderParameterDeclaration,
  ProviderTypeExpression,
} from "@tsonic/tsts";
import type {
  DotnetTypeParameterDeclaration,
  DotnetTypeRef,
} from "./model-types.js";

export function dotnetTypeRefToProviderType(type: DotnetTypeRef): ProviderTypeExpression {
  const providerType = tryDotnetTypeRefToProviderType(type);
  if (providerType === undefined) {
    throw unsupportedDotnetProviderType(type.kind);
  }
  return providerType;
}

export function tryDotnetTypeRefToProviderType(type: DotnetTypeRef): ProviderTypeExpression | undefined {
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
      const typeArguments = mapDotnetProviderTypes(type.typeArguments);
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
      const typeArguments = mapDotnetProviderTypes(type.typeArguments);
      const sourceShape = tryDotnetTypeRefToProviderType(type.sourceShape);
      if (typeArguments === undefined || sourceShape === undefined) {
        return undefined;
      }
      return {
        kind: "target-named",
        target: "csharp",
        id: type.targetId,
        ...(type.displayName !== undefined ? { displayName: type.displayName } : {}),
        ...(typeArguments.length > 0 ? { typeArguments } : {}),
        sourceShape,
      };
    }
    case "array": {
      if (type.rank !== undefined && type.rank !== 1) {
        return undefined;
      }
      const elementType = tryDotnetTypeRefToProviderType(type.elementType);
      return elementType === undefined ? undefined : { kind: "array", elementType };
    }
    case "nullable": {
      const elementType = tryDotnetTypeRefToProviderType(type.elementType);
      return elementType === undefined
        ? undefined
        : { kind: "union", types: [elementType, { kind: "literal", value: null }] };
    }
    case "tuple": {
      const elementTypes = mapDotnetProviderTypes(type.elements);
      return elementTypes === undefined ? undefined : { kind: "tuple", elementTypes };
    }
    case "union": {
      const types = mapDotnetProviderTypes(type.types);
      return types === undefined ? undefined : { kind: "union", types };
    }
    case "function": {
      const parameters = type.parameters.map(tryDotnetParameterToProviderParameter);
      const returnType = tryDotnetTypeRefToProviderType(type.returnType);
      if (parameters.some((parameter) => parameter === undefined) || returnType === undefined) {
        return undefined;
      }
      return {
        kind: "function",
        parameters: parameters as NonNullable<(typeof parameters)[number]>[],
        returnType,
        ...(type.typeParameters !== undefined ? { typeParameters: type.typeParameters.map(dotnetTypeParameterToProviderTypeParameter) } : {}),
      };
    }
    case "pointer":
    case "function-pointer":
      return undefined;
    case "opaque": {
      if (type.sourceShape === undefined) {
        return undefined;
      }
      const sourceShape = tryDotnetTypeRefToProviderType(type.sourceShape);
      if (sourceShape === undefined) {
        return undefined;
      }
      return {
        kind: "opaque",
        id: type.id,
        ...(type.displayName !== undefined ? { displayName: type.displayName } : {}),
        sourceShape,
      };
    }
  }
}

export function dotnetTypeParameterToProviderTypeParameter(typeParameter: DotnetTypeParameterDeclaration) {
  const defaultType = typeParameter.defaultType === undefined
    ? undefined
    : tryDotnetTypeRefToProviderType(typeParameter.defaultType);
  return {
    name: typeParameter.name,
    ...(typeParameter.variance !== undefined ? { variance: typeParameter.variance } : {}),
    ...(defaultType !== undefined ? { defaultType } : {}),
  };
}

function unsupportedDotnetProviderType(kind: DotnetTypeRef["kind"]): Error {
  return new Error(`Unsupported .NET provider type '${kind}'. Add a typed TSTS provider type expression before exposing this declaration.`);
}

function tryDotnetParameterToProviderParameter(
  parameter: Extract<DotnetTypeRef, { readonly kind: "function" }>["parameters"][number],
): ProviderParameterDeclaration | undefined {
  const type = tryDotnetTypeRefToProviderType(parameter.sourceType ?? parameter.type);
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

function mapDotnetProviderTypes(types: readonly DotnetTypeRef[] | undefined): readonly ProviderTypeExpression[] | undefined {
  if (types === undefined) {
    return [];
  }
  const mapped = types.map(tryDotnetTypeRefToProviderType);
  return mapped.some((type) => type === undefined)
    ? undefined
    : mapped as readonly ProviderTypeExpression[];
}

function providerRefString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
