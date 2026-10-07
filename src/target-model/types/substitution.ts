import type {
  TargetTypeRef,
} from "./model.js";
import type {
  CsharpObjectShapeFact,
  CsharpRuntimeUnionTargetTypeRef,
  CsharpTargetNamedTypeRef,
  CsharpTaskTargetTypeRef,
} from "./model.js";
import {
  csharpNullableTargetType,
  isCsharpNullableReferenceTargetType,
  getCsharpNullableElementTargetType,
} from "./nullable.js";
import { getCsharpRuntimeUnionArms, getCsharpGenericOptionalParts, isCsharpAbsenceTargetType } from "./runtime-carriers.js";
import {
  targetTypeRefEquals,
} from "./equality.js";
import { csharpTypeProjection, type CsharpOptionalTypeProjection } from "./projections.js";
import { resolveCsharpOptionalStorage } from "./optional-storage.js";
import { csharpFreeTypeParameterIdentities } from "./generic-references.js";
import type { CsharpTypeParameterConstraint } from "../declarations/generic-constraints.js";

export function substituteTargetTypeParameters(
  type: TargetTypeRef,
  substitutions: ReadonlyMap<string, TargetTypeRef>,
): TargetTypeRef {
  switch (type.kind) {
    case "type-parameter":
      const substitution = substitutions.get(type.identity);
      if (substitution === undefined) {
        const projection = csharpTypeProjection(type)?.csharpProjection;
        if (projection?.kind === "optional") {
          const element = substituteTargetTypeParameters(projection.arguments[0], substitutions);
          if (!targetTypeRefEquals(element, projection.arguments[0])) {
            const selected = resolveCsharpOptionalStorage(projection, element);
            if (selected === undefined) throw new Error("A substituted optional carrier has no native storage representation.");
            return selected;
          }
        }
        return type.csharpConstraints?.kind !== "resolved" ? type : { ...type,
          csharpConstraints: Object.freeze({ kind: "resolved", constraints:
            substituteConstraints(type.csharpConstraints.constraints, substitutions) }),
        };
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
      const indexedRead = (type as CsharpTargetNamedTypeRef).csharpIndexableReadMember;
      const baseType = (type as CsharpTargetNamedTypeRef).csharpBaseType;
      const taskResultType = (type as Partial<CsharpTaskTargetTypeRef>).csharpTaskResultType;
      const runtimeUnionArms = (type as Partial<CsharpRuntimeUnionTargetTypeRef>).csharpRuntimeUnionArms;
      const runtimeUnionObjectShapes = (type as Partial<CsharpRuntimeUnionTargetTypeRef>).csharpRuntimeUnionObjectShapes;
      const delegateSignature = (type as CsharpTargetNamedTypeRef).csharpDelegateSignature;
      const methodValue = (type as CsharpTargetNamedTypeRef).csharpMethodValue;
      const factory = (type as CsharpTargetNamedTypeRef).csharpClassFactory;
      const methodSubstitutions = methodValue === undefined ? substitutions
        : new Map([...substitutions].filter(([name]) => !methodValue.typeParameters.includes(name)));
      return {
        ...type,
        ...(factory === undefined ? {} : { csharpClassFactory: { ...factory,
          instance: substituteTargetTypeParameters(factory.instance, substitutions) as CsharpTargetNamedTypeRef,
        } }),
        ...(methodValue === undefined ? {} : { csharpMethodValue: { ...methodValue,
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
        ...(indexedRead === undefined ? {} : { csharpIndexableReadMember: {
          ...indexedRead,
          ...(indexedRead.declaringType === undefined ? {} : {
            declaringType: substituteTargetTypeParameters(indexedRead.declaringType, substitutions),
          }),
          ...(indexedRead.returnType === undefined ? {} : {
            returnType: substituteTargetTypeParameters(indexedRead.returnType, substitutions),
          }),
          parameters: indexedRead.parameters.map(parameter => ({ ...parameter,
            type: substituteTargetTypeParameters(parameter.type, substitutions),
          })),
        } }),
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
                parameterPassingModes: delegateSignature.parameterPassingModes,
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
  parameterIdentities: ReadonlySet<string>,
): ReadonlyMap<string, TargetTypeRef> | undefined {
  const bindings = new Map<string, TargetTypeRef>();
  const projections: { readonly contract: CsharpOptionalTypeProjection; readonly actual: TargetTypeRef }[] = [];
  if (!match(pattern, actual)) return undefined;
  for (const projection of projections) {
    if (projection.contract.part !== "storage" || isCsharpAbsenceTargetType(projection.actual)) continue;
    const element = projection.contract.arguments[0];
    const unresolved = [...csharpFreeTypeParameterIdentities([element])]
      .some(identity => parameterIdentities.has(identity) && !bindings.has(identity));
    if (unresolved && !match(element, getCsharpGenericOptionalParts(projection.actual)?.element ??
      getCsharpNullableElementTargetType(projection.actual) ?? projection.actual)) return undefined;
  }
  for (const projection of projections) {
    const element = substituteTargetTypeParameters(projection.contract.arguments[0], bindings);
    const selected = resolveCsharpOptionalStorage(projection.contract, element);
    if (selected === undefined || !targetTypeRefEquals(selected, projection.actual)) return undefined;
  }
  return bindings;

  function match(left: TargetTypeRef, right: TargetTypeRef): boolean {
    if (left.kind === "type-parameter" && parameterIdentities.has(left.identity)) {
      const existing = bindings.get(left.identity);
      if (existing === undefined) {
        bindings.set(left.identity, right);
        return true;
      }
      return targetTypeRefEquals(existing, right);
    }
    const projection = csharpTypeProjection(left)?.csharpProjection;
    if (projection?.kind === "optional" && projection.part === "operations") {
      projections.push({ contract: projection, actual: right });
      return true;
    }
    const optional = getCsharpGenericOptionalParts(left)?.element ?? getCsharpNullableElementTargetType(left);
    if (optional !== undefined) {
      return isCsharpAbsenceTargetType(right) ||
        match(optional, getCsharpGenericOptionalParts(right)?.element ?? getCsharpNullableElementTargetType(right) ?? right);
    }
    const patternArms = getCsharpRuntimeUnionArms(left);
    if (patternArms !== undefined && getCsharpRuntimeUnionArms(right) === undefined) {
      const candidates = patternArms.flatMap(arm => {
        const selected = inferCsharpTargetTypeParameterBindings(arm, right, parameterIdentities);
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
      leftArguments.every((argument, index) => {
        const projection = csharpTypeProjection(argument);
        if (projection?.csharpProjection.kind === "optional" && !parameterIdentities.has(projection.identity)) {
          projections.push({ contract: projection.csharpProjection, actual: rightArguments[index]! });
          return true;
        }
        return match(argument, rightArguments[index]!);
      });
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
          const boundParameters = new Set(member.typeParameters?.map(parameter => parameter.identity));
          const freeSubstitutions = boundParameters.size === 0 ? substitutions
            : new Map([...substitutions].filter(([identity]) => !boundParameters.has(identity)));
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
                constraints: substituteConstraints(parameter.constraints, freeSubstitutions),
              })),
            }),
          };
        }),
        ...(objectShape.implements === undefined
          ? {}
          : { implements: objectShape.implements.map((implemented) => substituteTargetTypeParameters(implemented, substitutions)) }),
      };
}

function substituteConstraints(
  constraints: readonly CsharpTypeParameterConstraint[],
  substitutions: ReadonlyMap<string, TargetTypeRef>,
): readonly CsharpTypeParameterConstraint[] {
  return Object.freeze(constraints.map(constraint => constraint.kind !== "type" ? constraint
    : Object.freeze({ ...constraint, type: substituteTargetTypeParameters(constraint.type, substitutions) })));
}
