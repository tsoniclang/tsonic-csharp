import type { CsharpPolicyContext } from "../model/context.js";
import type { CsharpConversionShapeQueries } from "./shape-queries.js";
import type { TargetTypeRef, CsharpTypeParameterConstraint } from "../../target-model/types/native-type-data.js";
import type { CsharpNativeCallableMember } from "../../target-model/types/model.js";
import type { CsharpNativeCallableApplication } from "../../target-model/conversions/selection.js";
import { csharpNativeCallableMemberKey } from "../../target-model/types/carriers/delegates.js";
import { getCsharpNullableElementTargetType, isCsharpNullableReferenceTargetType } from "../../target-model/types/carriers/nullable.js";
import { isCsharpReferenceCarrier, isCsharpValueTypeTargetType, isCsharpVoidTargetType } from "../../target-model/types/identity.js";
import { isCsharpRefLikeTargetType } from "../../target-model/types/ref-like.js";
import { substituteTargetTypeParameters } from "../../target-model/types/substitution.js";
import { csharpTypeParameterConstraintsImply } from "../constraints/type-parameter-constraints.js";
import { csharpTargetTypeSatisfiesNativeConstraint } from "./carriers.js";

type Policy = Pick<CsharpPolicyContext, "typeDefinitions" | "projectTypes" | "providers"> & CsharpConversionShapeQueries;

export function applyCsharpNativeCallableMember(policy: Policy, member: CsharpNativeCallableMember,
  arguments_: readonly TargetTypeRef[]): CsharpNativeCallableMember | undefined {
  const parameters = member.typeParameters;
  if (parameters.length !== arguments_.length || new Set(parameters.map(parameter => parameter.identity)).size !== parameters.length ||
    parameters.some(parameter => parameter.identity.length === 0)) return undefined;
  for (const argument of arguments_) if (argument === undefined || argument.kind === "pointer" ||
    argument.kind === "function-pointer" || argument.kind === "opaque" || isCsharpVoidTargetType(argument) ||
    isCsharpRefLikeTargetType(argument)) return undefined;
  const bindings = new Map(parameters.map((parameter, index) => [parameter.identity, arguments_[index]!]));
  for (const [index, parameter] of parameters.entries()) {
    const argument = arguments_[index]!;
    const required = parameter.constraints.map(constraint => constraint.kind === "type"
      ? { ...constraint, type: substituteTargetTypeParameters(constraint.type, bindings) } : constraint);
    const evidence = nativeArgumentConstraints(argument);
    if (evidence === undefined) return undefined;
    const implied = argument.kind === "type-parameter" ? required : required.filter(constraint => constraint.kind !== "type");
    if (!csharpTypeParameterConstraintsImply(policy, evidence, implied, new Map()) ||
      argument.kind !== "type-parameter" && required.some(constraint => constraint.kind === "type" &&
        !csharpTargetTypeSatisfiesNativeConstraint(policy, argument, constraint.type))) return undefined;
  }
  const signature = member.signature;
  return Object.freeze({ name: member.name, typeParameters: Object.freeze([]), signature: Object.freeze({
    ...signature,
    ...(signature.receiver === undefined ? {} : { receiver: Object.freeze({
      ...signature.receiver, type: substituteTargetTypeParameters(signature.receiver.type, bindings),
    }) }),
    parameters: Object.freeze(signature.parameters.map(parameter => substituteTargetTypeParameters(parameter, bindings))),
    returnType: substituteTargetTypeParameters(signature.returnType, bindings),
  }) });
}

export function csharpNativeCallableApplicationIsValid(policy: Policy,
  application: CsharpNativeCallableApplication): boolean {
  const applied = applyCsharpNativeCallableMember(policy, application.original, application.typeArguments);
  return applied !== undefined && csharpNativeCallableMemberKey(applied) === csharpNativeCallableMemberKey(application.applied);
}

function nativeArgumentConstraints(argument: TargetTypeRef): readonly CsharpTypeParameterConstraint[] | undefined {
  if (argument.kind === "type-parameter") return argument.csharpConstraints?.kind === "resolved"
    ? [{ kind: "type", type: argument }, ...argument.csharpConstraints.constraints] : undefined;
  const constraints: CsharpTypeParameterConstraint[] = [{ kind: "type", type: argument }];
  if (getCsharpNullableElementTargetType(argument) === undefined && !isCsharpNullableReferenceTargetType(argument)) {
    if (isCsharpValueTypeTargetType(argument)) constraints.push({ kind: "keyword", keyword: "struct" }, { kind: "constructor" });
    else if (isCsharpReferenceCarrier(argument)) constraints.push({ kind: "keyword", keyword: "class" });
  }
  if (argument.kind === "source-primitive") constraints.push({ kind: "keyword", keyword: "unmanaged" });
  return constraints;
}
