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
  CsharpJsCollectionTypeResolutionInput,
  CsharpJsCollectionTypeExpression,
} from "./types.js";

export function materializeCollectionMemberMetadata(input: CsharpJsCollectionMemberResolutionInput): readonly JsSurfaceTargetMemberMetadata[] {
  if (input.typeArguments.length !== input.policy.typeParameterNames.length) {
    return [];
  }
  return input.memberPolicy.members
    .map((shape) => materializeCollectionMemberShape(input, shape))
    .filter((member): member is JsSurfaceTargetMemberMetadata => member !== undefined);
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
    id: shape.id,
    sourceName: input.memberPolicy.sourceName,
    targetName: shape.targetName,
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
  return type === undefined
    ? undefined
    : targetParameter(
        parameter.name,
        type,
        csharpCollectionParameterRequiresClosedSourceArgument(type)
          ? { csharpAcceptsClosedSourceArgument: true }
          : {},
      );
}

function csharpCollectionParameterRequiresClosedSourceArgument(type: TargetTypeRef): boolean {
  return !(
    type.kind === "target-named" &&
    typeof (type as { readonly csharpDelegateSignature?: unknown }).csharpDelegateSignature === "object" &&
    (type as { readonly csharpDelegateSignature?: unknown }).csharpDelegateSignature !== null
  );
}

export function resolveCollectionTypeExpression(
  input: CsharpJsCollectionTypeResolutionInput,
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
