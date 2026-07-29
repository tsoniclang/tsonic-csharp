import {
  type AstReader,
  argumentPassingFactKey,
} from "@tsonic/tsts";
import type {
  ReadonlySourceFactResolver,
  SourceFile,
} from "@tsonic/tsts";
import type {
  TargetSelection,
} from "@tsonic/target-api";
import type {
  CsharpProviderRelationResolver,
} from "../../provider/target-relations/resolver.js";
import type {
  CsharpProviderTargetRelation,
} from "../../provider/target-relations/index.js";
import type {
  CsharpTargetMember,
  CsharpTypePolicy,
  TargetTypeRef,
} from "../types/index.js";
import {
  selectCsharpExpressionConversion,
} from "../conversions/index.js";
import {
  csharpTargetBindingSubstitutions,
  mergeCsharpTypeParameterSubstitutions,
  resolveCsharpTargetBindingArguments,
  substituteCsharpTargetMember,
} from "./binding-instantiation.js";
import type {
  CsharpSelectedCallArgument,
  CsharpSelectedTargetCall,
  ResolvedSourceCallInfo,
} from "./selection-types.js";

type CsharpProviderSignatureRelation = Extract<
  CsharpProviderTargetRelation,
  { readonly kind: "signature" }
>;

export interface CsharpInstantiatedProviderCall
  extends CsharpSelectedTargetCall {
  readonly origin: "provider";
  readonly relation: CsharpProviderSignatureRelation;
}

export type CsharpProviderCallInstantiation =
  | {
      readonly kind: "resolved";
      readonly call: CsharpInstantiatedProviderCall;
    }
  | {
      readonly kind: "rejected";
      readonly reason: string;
    };

export interface CsharpProviderCallInstantiationHost {
  readonly ast: AstReader;
  readonly sourceFacts?: ReadonlySourceFactResolver;
  readonly providers: CsharpProviderRelationResolver;
  readonly target: TargetSelection;
  readonly types: CsharpTypePolicy;
}

export function instantiateCsharpProviderCall(
  host: CsharpProviderCallInstantiationHost,
  relation: CsharpProviderSignatureRelation,
  source: ResolvedSourceCallInfo,
  sourceFile: SourceFile,
): CsharpProviderCallInstantiation {
  const relationError = validateProviderCallRelation(
    host.sourceFacts,
    relation,
    source,
  );
  if (relationError !== undefined) {
    return { kind: "rejected", reason: relationError };
  }
  const bindingArguments = resolveCsharpTargetBindingArguments(
    host.types,
    relation.targetBinding,
    [
      source.sourceReceiver?.type,
      source.sourceResultType,
      source.sourceCallee.type,
    ],
    sourceFile,
  );
  if (bindingArguments === undefined) {
    return {
      kind: "rejected",
      reason:
        "The exact selected receiver/result evidence does not close the provider target binding type parameters.",
    };
  }
  const methodArguments = resolveMethodTypeArguments(
    host.types,
    relation,
    source,
    sourceFile,
  );
  if (methodArguments === undefined) {
    return {
      kind: "rejected",
      reason:
        "The exact selected method type-argument evidence does not close the provider target method type parameters.",
    };
  }
  const substitutions = targetTypeParameterSubstitutions(
    relation,
    bindingArguments,
    methodArguments,
  );
  if (substitutions === undefined) {
    return {
      kind: "rejected",
      reason:
        "Provider binding and method type-parameter identities overlap and cannot be substituted unambiguously.",
    };
  }
  const targetMember = substituteCsharpTargetMember(
    relation.targetMember,
    substitutions,
  );
  const arguments_ = relateCallArguments(relation, targetMember, source);
  if (arguments_ === undefined) {
    return {
      kind: "rejected",
      reason:
        "The checker-selected source argument slots do not match the provider parameter relation.",
    };
  }
  if (!argumentsTargetSelectedParameters(host, targetMember, source, arguments_, sourceFile)) {
    return {
      kind: "rejected",
      reason:
        "A checker-selected source argument cannot satisfy its exact related C# target parameter.",
    };
  }
  return {
    kind: "resolved",
    call: {
      relation,
      origin: "provider",
      targetMember,
      receiver: relation.receiver,
      targetMethodTypeArguments: methodArguments,
      arguments: arguments_,
    },
  };
}

function validateProviderCallRelation(
  sourceFacts: ReadonlySourceFactResolver | undefined,
  relation: CsharpProviderSignatureRelation,
  source: ResolvedSourceCallInfo,
): string | undefined {
  const sourceParameters = source.sourceSelectedSignatureParameters;
  if (
    relation.parameters.length !== sourceParameters.length ||
    relation.parameters.length !== relation.targetMember.parameters.length -
      (relation.receiver.kind === "target-parameter" ? 1 : 0)
  ) {
    return "Provider parameter relation cardinality does not match the selected source and target signatures.";
  }
  const seenSource = new Set<number>();
  const seenTarget = new Set<number>();
  for (const parameterRelation of relation.parameters) {
    const sourceParameter =
      sourceParameters[parameterRelation.sourceParameterIndex];
    const targetParameter =
      relation.targetMember.parameters[parameterRelation.targetParameterIndex];
    if (
      sourceParameter === undefined ||
      targetParameter === undefined ||
      seenSource.has(parameterRelation.sourceParameterIndex) ||
      seenTarget.has(parameterRelation.targetParameterIndex)
    ) {
      return "Provider parameter relation contains a missing, duplicate, or out-of-range slot.";
    }
    seenSource.add(parameterRelation.sourceParameterIndex);
    seenTarget.add(parameterRelation.targetParameterIndex);
    const sourcePassingMode = sourceFacts?.getFact(
      sourceParameter.parameterDeclaration ?? sourceParameter.parameterSymbol,
      argumentPassingFactKey,
    )?.mode ?? "by-value";
    if (
      sourcePassingMode !== parameterRelation.sourcePassingMode ||
      targetParameter.passingMode !== parameterRelation.targetPassingMode ||
      sourceParameter.acceptsOmission !==
        parameterRelation.sourceAcceptsOmission ||
      (targetParameter.optional === true ||
        targetParameter.csharpOmittableOptionalArgument === true) !==
        parameterRelation.targetAcceptsOmission ||
      sourceParameter.rest !== parameterRelation.sourceRest ||
      (targetParameter.paramsArray === true) !==
        parameterRelation.targetParamsArray
    ) {
      return "Provider parameter relation contradicts selected source or target parameter semantics.";
    }
  }
  if (relation.receiver.kind === "target-parameter") {
    const receiverParameter =
      relation.targetMember.parameters[relation.receiver.targetParameterIndex];
    if (
      source.sourceReceiver === undefined ||
      receiverParameter === undefined ||
      seenTarget.has(relation.receiver.targetParameterIndex)
    ) {
      return "Provider first-argument receiver relation is incomplete or overlaps a source parameter.";
    }
  } else if (
    relation.receiver.kind === "instance" &&
    source.sourceReceiver === undefined
  ) {
    return "Provider instance relation has no checker-selected source receiver.";
  }
  return undefined;
}

function resolveMethodTypeArguments(
  types: CsharpTypePolicy,
  relation: CsharpProviderSignatureRelation,
  source: ResolvedSourceCallInfo,
  sourceFile: SourceFile,
): readonly TargetTypeRef[] | undefined {
  const sourceArguments = source.sourceSelectedMethodTypeArguments ?? [];
  const targetArity = relation.targetMember.typeParameters?.length ?? 0;
  if (
    sourceArguments.length !== relation.methodTypeParameters.length ||
    relation.methodTypeParameters.length !== targetArity
  ) {
    return undefined;
  }
  const targetArguments: (TargetTypeRef | undefined)[] =
    Array.from({ length: targetArity });
  for (const typeParameterRelation of relation.methodTypeParameters) {
    const sourceArgument =
      sourceArguments[typeParameterRelation.sourceTypeParameterIndex];
    if (
      sourceArgument === undefined ||
      targetArguments[typeParameterRelation.targetTypeParameterIndex] !==
        undefined
    ) {
      return undefined;
    }
    const targetArgument =
      types.resolveNode(sourceArgument.explicitTypeNode, sourceFile) ??
      types.resolveType(sourceArgument.selectedType, sourceFile);
    if (targetArgument === undefined) {
      return undefined;
    }
    targetArguments[typeParameterRelation.targetTypeParameterIndex] =
      targetArgument;
  }
  return targetArguments.every(
      (argument): argument is TargetTypeRef => argument !== undefined,
    )
    ? targetArguments
    : undefined;
}

function targetTypeParameterSubstitutions(
  relation: CsharpProviderSignatureRelation,
  bindingArguments: readonly TargetTypeRef[],
  methodArguments: readonly TargetTypeRef[],
): ReadonlyMap<string, TargetTypeRef> | undefined {
  const bindingSubstitutions = csharpTargetBindingSubstitutions(
    relation.targetBinding,
    bindingArguments,
  );
  if (bindingSubstitutions === undefined) {
    return undefined;
  }
  const methodSubstitutions = new Map<string, TargetTypeRef>();
  for (const [index, parameter] of
    (relation.targetMember.typeParameters ?? []).entries()) {
    const argument = methodArguments[index];
    if (argument === undefined || methodSubstitutions.has(parameter.name)) {
      return undefined;
    }
    methodSubstitutions.set(parameter.name, argument);
  }
  return mergeCsharpTypeParameterSubstitutions(
    bindingSubstitutions,
    methodSubstitutions,
  );
}

function relateCallArguments(
  relation: CsharpProviderSignatureRelation,
  targetMember: CsharpTargetMember,
  source: ResolvedSourceCallInfo,
): readonly CsharpSelectedCallArgument[] | undefined {
  const parameterBySource = new Map(
    relation.parameters.map((parameter) => [
      parameter.sourceParameterIndex,
      parameter,
    ]),
  );
  const related: CsharpSelectedCallArgument[] = [];
  for (const binding of source.sourceArgumentBindings) {
    const parameterRelation = parameterBySource.get(
      binding.sourceParameterIndex,
    );
    const targetParameter = parameterRelation === undefined
      ? undefined
      : targetMember.parameters[parameterRelation.targetParameterIndex];
    if (parameterRelation === undefined || targetParameter === undefined) {
      return undefined;
    }
    related.push({
      sourceArgumentIndex: binding.sourceArgumentIndex,
      effectiveArgumentIndex: binding.effectiveArgumentIndex,
      sourceForm: binding.sourceForm,
      ...(binding.spreadElementIndex === undefined
        ? {}
        : { spreadElementIndex: binding.spreadElementIndex }),
      targetParameterIndex: parameterRelation.targetParameterIndex,
      targetParameter,
    });
  }
  return Object.freeze(related);
}

function argumentsTargetSelectedParameters(
  host: CsharpProviderCallInstantiationHost,
  targetMember: CsharpTargetMember,
  source: ResolvedSourceCallInfo,
  arguments_: readonly CsharpSelectedCallArgument[],
  sourceFile: SourceFile,
): boolean {
  for (const argument of arguments_) {
    if (argument.targetParameter.csharpAcceptsCheckedSourceArgument === true) {
      continue;
    }
    const binding = source.sourceArgumentBindings.find((candidate) =>
      candidate.effectiveArgumentIndex === argument.effectiveArgumentIndex);
    if (binding === undefined) {
      return false;
    }
    const sourceType = host.types.resolveType(
      binding.selectedArgumentType,
      sourceFile,
    );
    const sourceExpression = source.sourceArguments[
      binding.sourceArgumentIndex
    ]?.expression;
    if (
      sourceType === undefined ||
      sourceExpression === undefined
    ) {
      return false;
    }
    const conversion = selectCsharpExpressionConversion(
      host,
      sourceExpression,
      sourceType,
      argument.targetParameter.type,
      "implicit",
    );
    if (
      conversion.kind !== "identity" &&
      conversion.kind !== "implicit" &&
      conversion.kind !== "delegate-adapter"
    ) {
      return false;
    }
  }
  return everyRequiredTargetParameterIsSupplied(targetMember, arguments_);
}

function everyRequiredTargetParameterIsSupplied(
  targetMember: CsharpTargetMember,
  arguments_: readonly CsharpSelectedCallArgument[],
): boolean {
  const supplied = new Set(
    arguments_.map((argument) => argument.targetParameterIndex),
  );
  return targetMember.parameters.every((parameter, index) =>
    supplied.has(index) ||
    parameter.optional === true ||
    parameter.csharpOmittableOptionalArgument === true ||
    parameter.paramsArray === true ||
    targetMember.receiverPassing === "first-argument" && index === 0);
}
