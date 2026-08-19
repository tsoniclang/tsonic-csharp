import type {
  CsharpTargetBindingFact,
  CsharpTargetMember,
  TargetTypeRef,
} from "../model/definitions.js";
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
        : { csharpInvocation: member.csharpInvocation }),
  };
}
