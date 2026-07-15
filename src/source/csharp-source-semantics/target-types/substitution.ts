import type {
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  CsharpObjectShapeFact,
} from "../../csharp-facts.js";
import type {
  CsharpRuntimeUnionTargetTypeRef,
  CsharpTargetNamedTypeRef,
  CsharpTaskTargetTypeRef,
} from "./definitions.js";
import {
  csharpNullableTargetType,
  isCsharpNullableReferenceTargetType,
} from "./nullable.js";

export function substituteTargetTypeParameters(
  type: TargetTypeRef,
  substitutions: ReadonlyMap<string, TargetTypeRef>,
): TargetTypeRef {
  switch (type.kind) {
    case "type-parameter":
      const substitution = substitutions.get(type.name);
      if (substitution === undefined) {
        return type;
      }
      return isCsharpNullableReferenceTargetType(type)
        ? csharpNullableTargetType(substitution)
        : substitution;
    case "source-global":
      return {
        ...type,
        ...(type.typeArguments === undefined
          ? {}
          : { typeArguments: type.typeArguments.map((argument) => substituteTargetTypeParameters(argument, substitutions)) }),
      };
    case "target-named":
      const arrayLiteralElementType = (type as CsharpTargetNamedTypeRef).csharpArrayLiteralElementType;
      const arrayLiteralConstructionType = (type as CsharpTargetNamedTypeRef).csharpArrayLiteralConstructionType;
      const enumerableElementType = (type as CsharpTargetNamedTypeRef).csharpEnumerableElementType;
      const readOnlyIndexableElementType = (type as CsharpTargetNamedTypeRef).csharpReadOnlyIndexableElementType;
      const denseMutableElementType = (type as CsharpTargetNamedTypeRef).csharpDenseMutableElementType;
      const baseType = (type as CsharpTargetNamedTypeRef).csharpBaseType;
      const taskResultType = (type as Partial<CsharpTaskTargetTypeRef>).csharpTaskResultType;
      const runtimeUnionArms = (type as Partial<CsharpRuntimeUnionTargetTypeRef>).csharpRuntimeUnionArms;
      const runtimeUnionObjectShapes = (type as Partial<CsharpRuntimeUnionTargetTypeRef>).csharpRuntimeUnionObjectShapes;
      const delegateSignature = (type as CsharpTargetNamedTypeRef).csharpDelegateSignature;
      return {
        ...type,
        ...(type.typeArguments === undefined ? {} : { typeArguments: type.typeArguments.map((argument) => substituteTargetTypeParameters(argument, substitutions)) }),
        ...(arrayLiteralElementType === undefined
          ? {}
          : { csharpArrayLiteralElementType: substituteTargetTypeParameters(arrayLiteralElementType, substitutions) }),
        ...(arrayLiteralConstructionType === undefined
          ? {}
          : { csharpArrayLiteralConstructionType: substituteTargetTypeParameters(arrayLiteralConstructionType, substitutions) }),
        ...(enumerableElementType === undefined
          ? {}
          : { csharpEnumerableElementType: substituteTargetTypeParameters(enumerableElementType, substitutions) }),
        ...(readOnlyIndexableElementType === undefined
          ? {}
          : { csharpReadOnlyIndexableElementType: substituteTargetTypeParameters(readOnlyIndexableElementType, substitutions) }),
        ...(denseMutableElementType === undefined
          ? {}
          : { csharpDenseMutableElementType: substituteTargetTypeParameters(denseMutableElementType, substitutions) }),
        ...(baseType === undefined
          ? {}
          : { csharpBaseType: substituteTargetTypeParameters(baseType, substitutions) }),
        ...(taskResultType === undefined
          ? {}
          : { csharpTaskResultType: substituteTargetTypeParameters(taskResultType, substitutions) }),
        ...(runtimeUnionArms === undefined
          ? {}
          : { csharpRuntimeUnionArms: runtimeUnionArms.map((arm) => substituteTargetTypeParameters(arm, substitutions)) }),
        ...(runtimeUnionObjectShapes === undefined
          ? {}
          : { csharpRuntimeUnionObjectShapes: runtimeUnionObjectShapes.map((objectShape) => substituteObjectShapeFactTargetTypeParameters(objectShape, substitutions)) }),
        ...(delegateSignature === undefined
          ? {}
          : {
              csharpDelegateSignature: {
                parameters: delegateSignature.parameters.map((parameter) => substituteTargetTypeParameters(parameter, substitutions)),
                returnType: substituteTargetTypeParameters(delegateSignature.returnType, substitutions),
              },
            }),
      };
    case "array":
      return { ...type, element: substituteTargetTypeParameters(type.element, substitutions) };
    case "tuple":
      return { ...type, elements: type.elements.map((element) => substituteTargetTypeParameters(element, substitutions)) };
    case "pointer":
      return { ...type, pointee: substituteTargetTypeParameters(type.pointee, substitutions) };
    case "function-pointer":
      return {
        ...type,
        args: type.args.map((argument) => substituteTargetTypeParameters(argument, substitutions)),
        result: substituteTargetTypeParameters(type.result, substitutions),
      };
    case "associated-type":
      return { ...type, owner: substituteTargetTypeParameters(type.owner, substitutions) };
    case "source-primitive":
    case "opaque":
    case "lifetime":
    case "target-specific":
      return type;
  }
}

function substituteObjectShapeFactTargetTypeParameters(
  objectShape: CsharpObjectShapeFact | undefined,
  substitutions: ReadonlyMap<string, TargetTypeRef>,
): CsharpObjectShapeFact | undefined {
  return objectShape === undefined
    ? undefined
    : {
        ...objectShape,
        targetType: substituteTargetTypeParameters(objectShape.targetType, substitutions),
        members: objectShape.members.map((member) => ({
          ...member,
          type: substituteTargetTypeParameters(member.type, substitutions),
        })),
        ...(objectShape.implements === undefined
          ? {}
          : { implements: objectShape.implements.map((implemented) => substituteTargetTypeParameters(implemented, substitutions)) }),
      };
}
