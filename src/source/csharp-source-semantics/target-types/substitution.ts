import type {
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  CsharpRuntimeUnionTargetTypeRef,
  CsharpTargetNamedTypeRef,
  CsharpTaskTargetTypeRef,
} from "./definitions.js";

export function substituteTargetTypeParameters(
  type: TargetTypeRef,
  substitutions: ReadonlyMap<string, TargetTypeRef>,
): TargetTypeRef {
  switch (type.kind) {
    case "type-parameter":
      return substitutions.get(type.name) ?? type;
    case "target-named":
      const arrayLiteralElementType = (type as CsharpTargetNamedTypeRef).csharpArrayLiteralElementType;
      const enumerableElementType = (type as CsharpTargetNamedTypeRef).csharpEnumerableElementType;
      const readOnlyIndexableElementType = (type as CsharpTargetNamedTypeRef).csharpReadOnlyIndexableElementType;
      const denseMutableElementType = (type as CsharpTargetNamedTypeRef).csharpDenseMutableElementType;
      const taskResultType = (type as Partial<CsharpTaskTargetTypeRef>).csharpTaskResultType;
      const runtimeUnionArms = (type as Partial<CsharpRuntimeUnionTargetTypeRef>).csharpRuntimeUnionArms;
      return {
        ...type,
        ...(type.typeArguments === undefined ? {} : { typeArguments: type.typeArguments.map((argument) => substituteTargetTypeParameters(argument, substitutions)) }),
        ...(arrayLiteralElementType === undefined
          ? {}
          : { csharpArrayLiteralElementType: substituteTargetTypeParameters(arrayLiteralElementType, substitutions) }),
        ...(enumerableElementType === undefined
          ? {}
          : { csharpEnumerableElementType: substituteTargetTypeParameters(enumerableElementType, substitutions) }),
        ...(readOnlyIndexableElementType === undefined
          ? {}
          : { csharpReadOnlyIndexableElementType: substituteTargetTypeParameters(readOnlyIndexableElementType, substitutions) }),
        ...(denseMutableElementType === undefined
          ? {}
          : { csharpDenseMutableElementType: substituteTargetTypeParameters(denseMutableElementType, substitutions) }),
        ...(taskResultType === undefined
          ? {}
          : { csharpTaskResultType: substituteTargetTypeParameters(taskResultType, substitutions) }),
        ...(runtimeUnionArms === undefined
          ? {}
          : { csharpRuntimeUnionArms: runtimeUnionArms.map((arm) => substituteTargetTypeParameters(arm, substitutions)) }),
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
