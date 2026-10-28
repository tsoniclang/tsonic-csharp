import type { CsharpPolicyContext } from "../model/context.js";
import type { CsharpConversionShapeQueries } from "./shape-queries.js";
import type { CsharpDelegateSignatureShape, TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpTypeParameterConstraint } from "../../target-model/types/generic-constraints.js";
import { getCsharpMethodValue } from "../../target-model/types/method-values.js";
import { getCsharpDelegateSignature } from "../../target-model/types/carriers/delegates.js";
import { getCsharpNullableElementTargetType, isCsharpNullableReferenceTargetType } from "../../target-model/types/carriers/nullable.js";
import { isCsharpReferenceCarrier, isCsharpValueTypeTargetType, isCsharpVoidTargetType } from "../../target-model/types/identity.js";
import { isCsharpRefLikeTargetType } from "../../target-model/types/ref-like.js";
import { csharpFreeTypeParameterIdentities, visitCsharpTargetTypeParameters } from "../../target-model/types/generic-references.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import { inferCsharpTargetTypeParameterBindings, substituteTargetTypeParameters } from "../types/resolution/substitution.js";
import { csharpTypeParameterConstraintsImply } from "../constraints/type-parameter-constraints.js";
import { csharpTargetTypeSatisfiesNativeConstraint } from "./carriers.js";

type Policy = Pick<CsharpPolicyContext, "typeDefinitions" | "projectTypes" | "providers"> & CsharpConversionShapeQueries;
type Parameter = Extract<TargetTypeRef, { readonly kind: "type-parameter" }>;

export interface CsharpCallableInstantiation {
  readonly contract: TargetTypeRef;
  readonly typeArguments: readonly TargetTypeRef[];
}

export function selectCsharpCallableInstantiation(
  policy: Policy, source: TargetTypeRef, destination: CsharpDelegateSignatureShape,
): CsharpCallableInstantiation | undefined {
  const method = getCsharpMethodValue(source);
  const signature = getCsharpDelegateSignature(method?.contract);
  if (method === undefined || method.typeParameters.length === 0 || signature === undefined ||
    signature.parameters.length > destination.parameters.length) return undefined;
  const identities = new Set(method.typeParameters);
  const bindings = new Map<string, TargetTypeRef>();
  const infer = (pattern: TargetTypeRef, actual: TargetTypeRef): boolean => {
    if (![...csharpFreeTypeParameterIdentities([pattern])].some(identity => identities.has(identity))) return true;
    const selected = inferCsharpTargetTypeParameterBindings(pattern, actual, identities);
    if (selected === undefined) return false;
    for (const [identity, value] of selected) {
      const existing = bindings.get(identity);
      if (existing !== undefined && !targetTypeRefEquals(existing, value)) return false;
      bindings.set(identity, value);
    }
    return true;
  };
  if (signature.parameters.some((parameter, index) => !infer(parameter, destination.parameters[index]!))) return undefined;
  if (bindings.size !== identities.size && !isCsharpVoidTargetType(destination.returnType) &&
    !infer(signature.returnType, destination.returnType)) return undefined;
  const arguments_ = method.typeParameters.map(identity => bindings.get(identity));
  if (arguments_.some(argument => argument === undefined)) return undefined;
  const typeArguments = arguments_.filter((argument): argument is TargetTypeRef => argument !== undefined);
  const contract = instantiateCsharpCallableContract(policy, source, typeArguments);
  return contract === undefined ? undefined : Object.freeze({ contract, typeArguments: Object.freeze(typeArguments) });
}

export function instantiateCsharpCallableContract(
  policy: Policy, source: TargetTypeRef, arguments_: readonly TargetTypeRef[],
): TargetTypeRef | undefined {
  const method = getCsharpMethodValue(source);
  if (method === undefined || method.typeParameters.length === 0 || method.typeParameters.length !== arguments_.length ||
    method.allowsRefLikeTypeArguments.length !== arguments_.length ||
    arguments_.some(argument => argument.kind === "pointer" || argument.kind === "function-pointer" ||
      argument.kind === "opaque" || isCsharpVoidTargetType(argument)) ||
    arguments_.some((argument, index) => isCsharpRefLikeTargetType(argument) && !method.allowsRefLikeTypeArguments[index])) return undefined;
  const parameters = new Map<string, Parameter>();
  visitCsharpTargetTypeParameters(method.contract, parameter => {
    if (method.typeParameters.includes(parameter.identity)) parameters.set(parameter.identity, parameter);
  });
  const bindings = new Map(method.typeParameters.map((identity, index) => [identity, arguments_[index]!]));
  for (const identity of method.typeParameters) {
    const parameter = parameters.get(identity);
    const argument = bindings.get(identity)!;
    if (parameter?.csharpConstraints?.kind !== "resolved") return undefined;
    const required = parameter.csharpConstraints.constraints.map(constraint => constraint.kind === "type"
      ? { ...constraint, type: substituteTargetTypeParameters(constraint.type, bindings) } : constraint);
    const evidence = nativeArgumentConstraints(argument);
    if (evidence === undefined) return undefined;
    const implied = argument.kind === "type-parameter" ? required : required.filter(constraint => constraint.kind !== "type");
    if (!csharpTypeParameterConstraintsImply(policy, evidence, implied, new Map()) ||
      argument.kind !== "type-parameter" && required.some(constraint => constraint.kind === "type" &&
        !csharpTargetTypeSatisfiesNativeConstraint(policy, argument, constraint.type))) return undefined;
  }
  return substituteTargetTypeParameters(method.contract, bindings);
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
