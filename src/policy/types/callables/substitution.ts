import type {
  TargetTypeRef,
} from "../../../target-model/types/model.js";
import type {
  CsharpObjectShapeFact,
  CsharpRuntimeUnionTargetTypeRef,
  CsharpTargetNamedTypeRef,
  CsharpTaskTargetTypeRef,
} from "../../../target-model/types/model.js";
import {
  csharpNullableReferenceTargetType,
  isCsharpNullableReferenceTargetType,
} from "../storage/nullable.js";
import {
  targetTypeRefEquals,
} from "../model/equality.js";

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
        ? csharpNullableReferenceTargetType(substitution)
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
      const implicitArrayInputElementType = (type as CsharpTargetNamedTypeRef).csharpImplicitArrayInputElementType;
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
        ...(implicitArrayInputElementType === undefined
          ? {}
          : { csharpImplicitArrayInputElementType: substituteTargetTypeParameters(implicitArrayInputElementType, substitutions) }),
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
                ...(delegateSignature.optionalParameterIndexes === undefined
                  ? {}
                  : { optionalParameterIndexes: delegateSignature.optionalParameterIndexes }),
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

export function inferCsharpTargetTypeParameterBindings(
  pattern: TargetTypeRef,
  actual: TargetTypeRef,
  parameterNames: ReadonlySet<string>,
): ReadonlyMap<string, TargetTypeRef> | undefined {
  const bindings = new Map<string, TargetTypeRef>();
  return match(pattern, actual) ? bindings : undefined;

  function match(left: TargetTypeRef, right: TargetTypeRef): boolean {
    if (left.kind === "type-parameter" && parameterNames.has(left.name)) {
      const existing = bindings.get(left.name);
      if (existing === undefined) {
        bindings.set(left.name, right);
        return true;
      }
      return targetTypeRefEquals(existing, right);
    }
    if (left.kind !== right.kind) {
      return false;
    }
    switch (left.kind) {
      case "source-global": {
        if (right.kind !== "source-global" || left.name !== right.name) {
          return false;
        }
        return matchArguments(left.typeArguments, right.typeArguments);
      }
      case "target-named": {
        if (right.kind !== "target-named" || left.id !== right.id) {
          return false;
        }
        return matchArguments(left.typeArguments, right.typeArguments);
      }
      case "array":
        return right.kind === "array" &&
          (left.rank ?? 1) === (right.rank ?? 1) &&
          match(left.element, right.element);
      case "tuple":
        return right.kind === "tuple" &&
          left.elements.length === right.elements.length &&
          left.elements.every((element, index) =>
            match(element, right.elements[index]!));
      case "pointer":
        return right.kind === "pointer" &&
          (left.mutability ?? "target-defined") ===
            (right.mutability ?? "target-defined") &&
          match(left.pointee, right.pointee);
      case "function-pointer":
        return right.kind === "function-pointer" &&
          stringListsEqual(left.abi, right.abi) &&
          left.args.length === right.args.length &&
          left.args.every((argument, index) =>
            match(argument, right.args[index]!)) &&
          match(left.result, right.result);
      case "associated-type":
        return right.kind === "associated-type" &&
          left.name === right.name &&
          match(left.owner, right.owner);
      case "source-primitive":
      case "type-parameter":
      case "opaque":
      case "lifetime":
      case "target-specific":
        return targetTypeRefEquals(left, right);
    }
  }

  function matchArguments(
    left: readonly TargetTypeRef[] | undefined,
    right: readonly TargetTypeRef[] | undefined,
  ): boolean {
    const leftArguments = left ?? [];
    const rightArguments = right ?? [];
    return leftArguments.length === rightArguments.length &&
      leftArguments.every((argument, index) =>
        match(argument, rightArguments[index]!));
  }
}

function stringListsEqual(
  left: readonly string[] | undefined,
  right: readonly string[] | undefined,
): boolean {
  const leftValues = left ?? [];
  const rightValues = right ?? [];
  return leftValues.length === rightValues.length &&
    leftValues.every((value, index) => value === rightValues[index]);
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
