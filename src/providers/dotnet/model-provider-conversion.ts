import type {
  ProviderTypeExpression,
} from "@tsonic/tsts";
import type {
  DotnetConstraint,
  DotnetTypeParameterDeclaration,
  DotnetTypeRef,
} from "./model-types.js";

export function dotnetTypeRefToProviderType(type: DotnetTypeRef): ProviderTypeExpression {
  switch (type.kind) {
    case "void":
    case "any":
    case "unknown":
    case "object":
    case "string":
    case "boolean":
    case "number":
    case "bigint":
      return { kind: type.kind };
    case "source-primitive":
      return { kind: "source-primitive", name: type.name };
    case "type-parameter":
      return { kind: "type-parameter", name: type.name };
    case "provider-ref":
      return {
        kind: "provider-ref",
        name: type.name,
        ...(type.typeArguments !== undefined ? { typeArguments: type.typeArguments.map(dotnetTypeRefToProviderType) } : {}),
      };
    case "named":
      return {
        kind: "target-named",
        target: "csharp",
        id: type.metadataName,
        ...(type.displayName !== undefined ? { displayName: type.displayName } : {}),
        ...(type.typeArguments !== undefined ? { typeArguments: type.typeArguments.map(dotnetTypeRefToProviderType) } : {}),
        ...(type.sourceShape !== undefined ? { sourceShape: dotnetTypeRefToProviderType(type.sourceShape) } : {}),
      };
    case "array":
      return { kind: "array", elementType: dotnetTypeRefToProviderType(type.elementType) };
    case "tuple":
      return { kind: "tuple", elementTypes: type.elements.map(dotnetTypeRefToProviderType) };
    case "union":
      return { kind: "union", types: type.types.map(dotnetTypeRefToProviderType) };
    case "function":
      return {
        kind: "function",
        parameters: type.parameters.map((parameter) => ({
          name: parameter.name,
          type: dotnetTypeRefToProviderType(parameter.type),
          ...(parameter.optional === true ? { optional: true } : {}),
          ...(parameter.rest === true ? { rest: true } : {}),
        })),
        returnType: dotnetTypeRefToProviderType(type.returnType),
        ...(type.typeParameters !== undefined ? { typeParameters: type.typeParameters.map(dotnetTypeParameterToProviderTypeParameter) } : {}),
      };
    case "pointer":
    case "function-pointer":
      throw unsupportedDotnetProviderType(type.kind);
    case "opaque":
      return {
        kind: "opaque",
        id: type.id,
        ...(type.displayName !== undefined ? { displayName: type.displayName } : {}),
        ...(type.sourceShape !== undefined ? { sourceShape: dotnetTypeRefToProviderType(type.sourceShape) } : {}),
      };
  }
}

export function dotnetTypeParameterToProviderTypeParameter(typeParameter: DotnetTypeParameterDeclaration) {
  const providerConstraints = (typeParameter.constraints ?? []).flatMap(dotnetConstraintToProviderConstraints);
  return {
    name: typeParameter.name,
    ...(providerConstraints.length > 0 ? { constraints: providerConstraints } : {}),
    ...(typeParameter.variance !== undefined ? { variance: typeParameter.variance } : {}),
  };
}

function dotnetConstraintToProviderConstraints(constraint: DotnetConstraint): readonly ProviderTypeExpression[] {
  switch (constraint.kind) {
    case "implements":
      return [dotnetTypeRefToProviderType(constraint.contract)];
    case "value-type":
    case "reference-type":
    case "constructible":
    case "unmanaged":
    case "not-null":
    case "target-specific":
      return [];
    default:
      return [];
  }
}

function unsupportedDotnetProviderType(kind: DotnetTypeRef["kind"]): Error {
  return new Error(`Unsupported .NET provider type '${kind}'. Add a typed TSTS provider type expression before exposing this declaration.`);
}
