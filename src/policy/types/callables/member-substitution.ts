import type {
  CsharpTargetBindingFact,
  CsharpTargetMember,
  TargetConstraint,
  TargetTypeRef,
} from "../../../target-model/types/model.js";
import {
  substituteTargetTypeParameters,
} from "./substitution.js";

export function csharpTargetBindingSubstitutions(
  binding: CsharpTargetBindingFact,
  arguments_: readonly TargetTypeRef[],
): ReadonlyMap<string, TargetTypeRef> | undefined {
  const parameters = binding.typeParameters ?? [];
  if (parameters.length !== arguments_.length) {
    return undefined;
  }
  return new Map(
    parameters.map((parameter, index) => [
      parameter.name,
      arguments_[index]!,
    ]),
  );
}

export function substituteCsharpTargetMember(
  member: CsharpTargetMember,
  substitutions: ReadonlyMap<string, TargetTypeRef>,
): CsharpTargetMember {
  return {
    ...member,
    parameters: member.parameters.map((parameter) => ({
      ...parameter,
      type: substituteTargetTypeParameters(parameter.type, substitutions),
      ...(parameter.csharpSourceArgumentAdapter === undefined
        ? {}
        : {
            csharpSourceArgumentAdapter: {
              ...parameter.csharpSourceArgumentAdapter,
              sourceCallableType: substituteTargetTypeParameters(
                parameter.csharpSourceArgumentAdapter.sourceCallableType,
                substitutions,
              ),
            },
          }),
    })),
    ...(member.returnType === undefined
      ? {}
      : {
          returnType: substituteTargetTypeParameters(
            member.returnType,
            substitutions,
          ),
        }),
    ...(member.declaringType === undefined
      ? {}
      : {
          declaringType: substituteTargetTypeParameters(
            member.declaringType,
            substitutions,
          ),
        }),
    ...(member.typeParameters === undefined
      ? {}
      : {
          typeParameters: member.typeParameters.map((parameter) => ({
            ...parameter,
            ...(parameter.constraints === undefined
              ? {}
              : {
                  constraints: parameter.constraints.map((constraint) =>
                    substituteTargetConstraint(constraint, substitutions)),
                }),
          })),
        }),
    ...(member.csharpBinaryEpilogues === undefined
      ? {}
      : {
          csharpBinaryEpilogues: member.csharpBinaryEpilogues.map((epilogue) => ({
            ...epilogue,
            declaringType: substituteTargetTypeParameters(
              epilogue.declaringType,
              substitutions,
            ),
          })),
        }),
    ...(member.csharpInvocation === undefined
      ? {}
      : member.csharpInvocation.kind === "static-factory-construction"
        ? {
            csharpInvocation: {
              ...member.csharpInvocation,
              factoryType: substituteTargetTypeParameters(
                member.csharpInvocation.factoryType,
                substitutions,
              ),
            },
          }
        : member.csharpInvocation.kind === "source-module-construction"
          ? {
              csharpInvocation: {
                ...member.csharpInvocation,
                bootstrap: {
                  ...member.csharpInvocation.bootstrap,
                  declaringType: substituteTargetTypeParameters(
                    member.csharpInvocation.bootstrap.declaringType,
                    substitutions,
                  ),
                },
              },
            }
          : { csharpInvocation: member.csharpInvocation }),
  };
}

export function substituteTargetConstraint(
  constraint: TargetConstraint,
  substitutions: ReadonlyMap<string, TargetTypeRef>,
): TargetConstraint {
  return constraint.kind === "implements" &&
      constraint.typeArguments !== undefined
    ? {
        ...constraint,
        typeArguments: constraint.typeArguments.map((argument) =>
          substituteTargetTypeParameters(argument, substitutions)),
      }
    : constraint;
}
