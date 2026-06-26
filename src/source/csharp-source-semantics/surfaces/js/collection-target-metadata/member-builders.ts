import type {
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  csharpDelegateTargetType,
  csharpEnumerableTargetType,
  csharpNullableTargetType,
  csharpSourcePrimitiveTargetType,
  csharpVoidTargetType,
  targetParameter,
} from "../source-library.js";
import type {
  JsSurfaceTargetMemberMetadata,
} from "../target-member-metadata.js";
import type {
  CsharpJsCollectionMemberResolutionInput,
  CsharpJsCollectionMemberShape,
  CsharpJsCollectionParameterShape,
  CsharpJsCollectionTypeExpression,
  CsharpJsCollectionMemberPolicy,
} from "./types.js";

export function collectionMemberShape(
  sourceName: string,
  members: readonly CsharpJsCollectionMemberShape[],
): CsharpJsCollectionMemberPolicy {
  return {
    sourceName,
    members,
  };
}

export function collectionConstructorShape(
  id: string,
  parameters: readonly CsharpJsCollectionParameterShape[] = [],
): CsharpJsCollectionMemberShape {
  return {
    id,
    kind: "constructor",
    parameters,
    returnType: { kind: "declaring" },
  };
}

export function collectionMethodShape(
  sourceName: string,
  parameters: readonly CsharpJsCollectionParameterShape[],
  returnType: CsharpJsCollectionTypeExpression,
): CsharpJsCollectionMemberShape {
  return {
    kind: "method",
    parameters,
    returnType,
    targetName: sourceName,
  };
}

export function materializeCollectionMemberMetadata(input: CsharpJsCollectionMemberResolutionInput): readonly JsSurfaceTargetMemberMetadata[] {
  if (input.typeArguments.length !== input.policy.typeParameterNames.length) {
    return [];
  }
  return input.memberPolicy.members
    .map((shape) => materializeCollectionMemberShape(input, shape))
    .filter((member): member is JsSurfaceTargetMemberMetadata => member !== undefined);
}

export function mapForEachMemberShapes(): readonly CsharpJsCollectionMemberShape[] {
  return [
    collectionMethodShape("forEach", [parameterShape("callback", action(typeArgument(1)))], voidType()),
    collectionMethodShape("forEach", [parameterShape("callback", action(typeArgument(1), typeArgument(0)))], voidType()),
    collectionMethodShape("forEach", [parameterShape("callback", action(typeArgument(1), typeArgument(0), declaringType()))], voidType()),
  ];
}

export function setForEachMemberShapes(): readonly CsharpJsCollectionMemberShape[] {
  return [
    collectionMethodShape("forEach", [parameterShape("callback", action(typeArgument(0)))], voidType()),
    collectionMethodShape("forEach", [parameterShape("callback", action(typeArgument(0), typeArgument(0)))], voidType()),
    collectionMethodShape("forEach", [parameterShape("callback", action(typeArgument(0), typeArgument(0), declaringType()))], voidType()),
  ];
}

export function sameParameterMapPolicies(
  sourceNames: readonly string[],
  parameters: readonly CsharpJsCollectionParameterShape[],
  returnType: CsharpJsCollectionTypeExpression,
): readonly CsharpJsCollectionMemberPolicy[] {
  return sourceNames.map((sourceName) => collectionMemberShape(sourceName, [
    collectionMethodShape(sourceName, parameters, returnType),
  ]));
}

export function noParameterMapPolicies(
  sourceNames: readonly string[],
  returnType: CsharpJsCollectionTypeExpression,
): readonly CsharpJsCollectionMemberPolicy[] {
  return sourceNames.map((sourceName) => collectionMemberShape(sourceName, [
    collectionMethodShape(sourceName, [], returnType),
  ]));
}

export function parameterShape(name: string, type: CsharpJsCollectionTypeExpression): CsharpJsCollectionParameterShape {
  return { name, type };
}

export function declaringType(): CsharpJsCollectionTypeExpression {
  return { kind: "declaring" };
}

export function typeArgument(index: number): CsharpJsCollectionTypeExpression {
  return { kind: "type-argument", index };
}

export function tupleType(...elements: readonly CsharpJsCollectionTypeExpression[]): CsharpJsCollectionTypeExpression {
  return { kind: "tuple", elements };
}

export function enumerableType(element: CsharpJsCollectionTypeExpression): CsharpJsCollectionTypeExpression {
  return { kind: "enumerable", element };
}

export function nullableType(value: CsharpJsCollectionTypeExpression): CsharpJsCollectionTypeExpression {
  return { kind: "nullable", value };
}

export function primitiveType(name: "bool" | "int32"): CsharpJsCollectionTypeExpression {
  return { kind: "primitive", name };
}

export function voidType(): CsharpJsCollectionTypeExpression {
  return { kind: "void" };
}

function action(...typeArguments: readonly CsharpJsCollectionTypeExpression[]): CsharpJsCollectionTypeExpression {
  return { kind: "delegate", id: "System.Action", typeArguments };
}

function materializeCollectionMemberShape(
  input: CsharpJsCollectionMemberResolutionInput,
  shape: CsharpJsCollectionMemberShape,
): JsSurfaceTargetMemberMetadata | undefined {
  const returnType = resolveCollectionTypeExpression(input, shape.returnType);
  if (returnType === undefined) {
    return undefined;
  }
  const parameters = (shape.parameters ?? []).map((parameter) => materializeCollectionParameter(input, parameter));
  if (parameters.some((parameter) => parameter === undefined)) {
    return undefined;
  }
  return {
    id: shape.id ?? `Tsonic.CSharp.Js.${input.policy.targetName}.${input.memberPolicy.sourceName}`,
    sourceName: input.memberPolicy.sourceName,
    targetName: shape.targetName ?? input.memberPolicy.sourceName,
    kind: shape.kind,
    parameters: parameters.filter((parameter): parameter is NonNullable<typeof parameter> => parameter !== undefined),
    returnType,
    declaringType: input.declaringType,
  };
}

function materializeCollectionParameter(
  input: CsharpJsCollectionMemberResolutionInput,
  parameter: CsharpJsCollectionParameterShape,
) {
  const type = resolveCollectionTypeExpression(input, parameter.type);
  return type === undefined ? undefined : targetParameter(parameter.name, type);
}

function resolveCollectionTypeExpression(
  input: CsharpJsCollectionMemberResolutionInput,
  expression: CsharpJsCollectionTypeExpression,
): TargetTypeRef | undefined {
  switch (expression.kind) {
    case "declaring":
      return input.declaringType;
    case "type-argument":
      return input.typeArguments[expression.index];
    case "tuple": {
      const elements = expression.elements.map((element) => resolveCollectionTypeExpression(input, element));
      return elements.some((element) => element === undefined)
        ? undefined
        : { kind: "tuple", elements: elements.filter((element): element is TargetTypeRef => element !== undefined) };
    }
    case "enumerable": {
      const element = resolveCollectionTypeExpression(input, expression.element);
      return element === undefined ? undefined : csharpEnumerableTargetType(element);
    }
    case "nullable": {
      const value = resolveCollectionTypeExpression(input, expression.value);
      return value === undefined ? undefined : csharpNullableTargetType(value);
    }
    case "primitive":
      return csharpSourcePrimitiveTargetType(expression.name);
    case "void":
      return csharpVoidTargetType();
    case "delegate": {
      const typeArguments = expression.typeArguments.map((typeArgumentExpression) => resolveCollectionTypeExpression(input, typeArgumentExpression));
      return typeArguments.some((typeArgumentValue) => typeArgumentValue === undefined)
        ? undefined
        : csharpDelegateTargetType("System.Action", typeArguments.filter((typeArgumentValue): typeArgumentValue is TargetTypeRef => typeArgumentValue !== undefined));
    }
  }
}
