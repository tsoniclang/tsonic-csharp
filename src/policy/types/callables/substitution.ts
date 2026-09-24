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
  csharpNullableTargetType,
  isCsharpNullableReferenceTargetType,
  getCsharpNullableElementTargetType,
} from "../../../target-model/types/nullable.js";
import { getCsharpRuntimeUnionArms, getCsharpGenericOptionalParts } from "../../../target-model/types/runtime-carriers.js";
import {
  targetTypeRefEquals,
} from "../../../target-model/types/equality.js";

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
      const implicitArrayInputElementType = (type as CsharpTargetNamedTypeRef).csharpImplicitArrayInputElementType;
      const enumerableElementType = (type as CsharpTargetNamedTypeRef).csharpEnumerableElementType;
      const arrayLikeElementType = (type as CsharpTargetNamedTypeRef).csharpArrayLikeElementType;
      const readOnlyIndexableElementType = (type as CsharpTargetNamedTypeRef).csharpReadOnlyIndexableElementType;
      const denseMutableElementType = (type as CsharpTargetNamedTypeRef).csharpDenseMutableElementType;
      const baseType = (type as CsharpTargetNamedTypeRef).csharpBaseType;
      const taskResultType = (type as Partial<CsharpTaskTargetTypeRef>).csharpTaskResultType;
      const runtimeUnionArms = (type as Partial<CsharpRuntimeUnionTargetTypeRef>).csharpRuntimeUnionArms;
      const runtimeUnionObjectShapes = (type as Partial<CsharpRuntimeUnionTargetTypeRef>).csharpRuntimeUnionObjectShapes;
      const delegateSignature = (type as CsharpTargetNamedTypeRef).csharpDelegateSignature;
      const methodValue = (type as CsharpTargetNamedTypeRef).csharpGenericMethodValue;
      const factory = (type as CsharpTargetNamedTypeRef).csharpClassFactory;
      const methodSubstitutions = methodValue === undefined ? substitutions
        : new Map([...substitutions].filter(([name]) => !methodValue.typeParameters.includes(name)));
      return {
        ...type,
        ...(factory === undefined ? {} : { csharpClassFactory: { ...factory,
          instance: substituteTargetTypeParameters(factory.instance, substitutions) as CsharpTargetNamedTypeRef,
        } }),
        ...(methodValue === undefined ? {} : { csharpGenericMethodValue: { ...methodValue,
          owner: substituteTargetTypeParameters(methodValue.owner, substitutions),
          contract: substituteTargetTypeParameters(methodValue.contract, methodSubstitutions),
        } }),
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
        ...(arrayLikeElementType === undefined
          ? {}
          : { csharpArrayLikeElementType: substituteTargetTypeParameters(arrayLikeElementType, substitutions) }),
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
                ...(delegateSignature.returnPassing === undefined
                  ? {}
                  : { returnPassing: delegateSignature.returnPassing }),
                ...(delegateSignature.optionalParameterIndexes === undefined
                  ? {}
                  : { optionalParameterIndexes: delegateSignature.optionalParameterIndexes }),
                ...(delegateSignature.restParameterIndex === undefined
                  ? {}
                  : { restParameterIndex: delegateSignature.restParameterIndex }),
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
    const optional = getCsharpGenericOptionalParts(left);
    if (optional !== undefined) {
      return match(optional.element, getCsharpGenericOptionalParts(right)?.element ?? getCsharpNullableElementTargetType(right) ?? right);
    }
    if (left.kind === "type-parameter" && parameterNames.has(left.name)) {
      const existing = bindings.get(left.name);
      if (existing === undefined) {
        bindings.set(left.name, right);
        return true;
      }
      return targetTypeRefEquals(existing, right);
    }
    const leftElement = getCsharpNullableElementTargetType(left);
    if (leftElement !== undefined) {
      return match(leftElement, getCsharpNullableElementTargetType(right) ?? right);
    }
    const patternArms = getCsharpRuntimeUnionArms(left);
    if (patternArms !== undefined && getCsharpRuntimeUnionArms(right) === undefined) {
      const candidates = patternArms.flatMap(arm => {
        const selected = inferCsharpTargetTypeParameterBindings(arm, right, parameterNames);
        return selected === undefined ? [] : [selected];
      });
      if (candidates.length !== 1) return false;
      for (const [name, type] of candidates[0]!) {
        const existing = bindings.get(name);
        if (existing !== undefined && !targetTypeRefEquals(existing, type)) return false;
        bindings.set(name, type);
      }
      return true;
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

export function substituteObjectShapeFactTargetTypeParameters(
  objectShape: CsharpObjectShapeFact | undefined,
  substitutions: ReadonlyMap<string, TargetTypeRef>,
): CsharpObjectShapeFact | undefined {
  return objectShape === undefined
    ? undefined
    : {
        ...objectShape,
        declarationTemplate: objectShape.declarationTemplate ?? objectShape,
        targetType: substituteTargetTypeParameters(objectShape.targetType, substitutions),
        ...(objectShape.methodImplementation === undefined ? {} : {
          methodImplementation: { ...objectShape.methodImplementation,
            captures: objectShape.methodImplementation.captures.map(capture => ({ ...capture,
              type: substituteTargetTypeParameters(capture.type, substitutions),
            })),
          },
        }),
        members: objectShape.members.map(member => {
          const boundNames = new Set(member.typeParameters?.map(parameter => parameter.name));
          const freeSubstitutions = boundNames.size === 0 ? substitutions
            : new Map([...substitutions].filter(([name]) => !boundNames.has(name)));
          return { ...member,
            type: substituteTargetTypeParameters(member.type, freeSubstitutions),
            ...(member.methodStorageType === undefined ? {} : {
              methodStorageType: substituteTargetTypeParameters(member.methodStorageType, substitutions),
            }),
            ...(member.methodValueContract === undefined ? {} : {
              methodValueContract: substituteTargetTypeParameters(member.methodValueContract, substitutions),
            }),
            ...(member.typeParameters === undefined ? {} : {
              typeParameters: member.typeParameters.map(parameter => ({ ...parameter,
                constraints: parameter.constraints.map(constraint => constraint.kind !== "type" ? constraint
                  : { ...constraint, type: substituteTargetTypeParameters(constraint.type, freeSubstitutions) }),
              })),
            }),
          };
        }),
        ...(objectShape.implements === undefined
          ? {}
          : { implements: objectShape.implements.map((implemented) => substituteTargetTypeParameters(implemented, substitutions)) }),
      };
}
