import {
  type AstReader,
} from "@tsonic/tsts";
import type {
  ReadonlySourceFactResolver,
  SourceFile,
} from "@tsonic/tsts";
import type {
  TargetSelection,
  TargetTypescriptCompatibilityMode,
} from "@tsonic/target-api";
import type {
  CsharpProviderRelationResolver,
} from "../../../providers/model/relation-resolver.js";
import type {
  CsharpProviderTargetRelation,
} from "../../../providers/relations/index.js";
import type {
  CsharpTargetMember,
  CsharpProjectTypePolicy,
  CsharpObjectShapePolicy,
  CsharpTypePolicy,
  TargetTypeRef,
} from "../../types/index.js";
import {
  csharpTargetBindingSubstitutions,
  csharpTargetParameterValueType,
  csharpTargetStorageIdentityEquals,
  substituteCsharpTargetMember,
  targetTypeRefKey,
} from "../../types/index.js";
import {
  compareCsharpImplicitConversionTargets,
  selectCsharpProviderArgumentConversion,
} from "../../conversions/index.js";
import { csharpSourceArgumentPassingMode } from "../selection/argument-selection.js";
import {
  mergeCsharpTypeParameterSubstitutions,
  resolveCsharpTargetBindingArguments,
} from "./binding-instantiation.js";
import {
  selectCsharpSourceArgument,
} from "../selection/argument-selection.js";
import type {
  CsharpSelectedCallArgument,
  CsharpProviderArgumentMapping,
  CsharpSelectedTargetMethodTypeArgument,
  CsharpSelectedTargetCall,
  ResolvedSourceCallInfo,
} from "../selection/selection-types.js";

type CsharpProviderSignatureRelation = Extract<
  CsharpProviderTargetRelation,
  { readonly kind: "signature" }
>;

export type CsharpInstantiatedProviderCall = Extract<
  CsharpSelectedTargetCall,
  { readonly origin: "provider" }
>;

export type CsharpProviderCallInstantiation =
  | {
      readonly kind: "resolved";
      readonly call: CsharpInstantiatedProviderCall;
      readonly argumentMappings: readonly CsharpProviderArgumentMapping[];
    }
  | {
      readonly kind: "rejected";
      readonly reason: string;
    };

export interface CsharpProviderCallInstantiationHost {
  readonly ast: AstReader;
  readonly sourceFacts?: ReadonlySourceFactResolver;
  readonly providers: CsharpProviderRelationResolver;
  readonly objectShapes?: CsharpObjectShapePolicy;
  readonly projectTypes: CsharpProjectTypePolicy;
  readonly target: TargetSelection;
  readonly typescriptCompatibility: TargetTypescriptCompatibilityMode;
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
  const bindingArguments = resolveProviderBindingTypeArguments(
    host.types,
    relation,
    source,
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
  const argumentValidation = validateArgumentsTargetSelectedParameters(
    host,
    relation,
    targetMember,
    source,
    arguments_,
    sourceFile,
  );
  if (argumentValidation.kind === "rejected") {
    return {
      kind: "rejected",
      reason: argumentValidation.reason,
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
      argumentMappings: argumentValidation.argumentMappings,
    },
    argumentMappings: argumentValidation.argumentMappings,
  };
}

export function compareInstantiatedProviderCalls(
  host: Pick<
    CsharpProviderCallInstantiationHost,
    "projectTypes" | "providers" | "target" | "typescriptCompatibility"
  >,
  left: Extract<CsharpProviderCallInstantiation, { readonly kind: "resolved" }>,
  right: Extract<CsharpProviderCallInstantiation, { readonly kind: "resolved" }>,
): "left" | "right" | "equivalent" | "incomparable" {
  const rightByArgument = new Map(
    right.argumentMappings.map((mapping) => [
      mapping.effectiveArgumentIndex,
      mapping,
    ]),
  );
  let leftBetter = false;
  let rightBetter = false;
  for (const leftMapping of left.argumentMappings) {
    const rightConversion = rightByArgument.get(
      leftMapping.effectiveArgumentIndex,
    );
    if (rightConversion === undefined) {
      return "incomparable";
    }
    const preference = compareCsharpImplicitConversionTargets(
      host,
      leftMapping.targetType,
      rightConversion.targetType,
    );
    leftBetter ||= preference === "left";
    rightBetter ||= preference === "right";
    if (preference === "incomparable" || leftBetter && rightBetter) {
      return "incomparable";
    }
  }
  if (rightByArgument.size !== left.argumentMappings.length) {
    return "incomparable";
  }
  if (leftBetter === rightBetter) {
    return "equivalent";
  }
  return leftBetter ? "left" : "right";
}

function resolveProviderBindingTypeArguments(
  types: CsharpTypePolicy,
  relation: CsharpProviderSignatureRelation,
  source: ResolvedSourceCallInfo,
  sourceFile: SourceFile,
): readonly TargetTypeRef[] | undefined {
  if (
    relation.bindingTypeArgumentSource !==
      "selected-operation-type-arguments"
  ) {
    const evidence = relation.bindingTypeArgumentSource === "receiver"
      ? {
          node: source.sourceReceiver?.expression,
          type: source.sourceReceiver?.type,
        }
      : relation.bindingTypeArgumentSource === "callee"
        ? {
            node: source.sourceCallee.expression,
            type: source.sourceCallee.type,
          }
        : { type: source.sourceResultType };
    return resolveCsharpTargetBindingArguments(
      types,
      relation.targetBinding,
      [evidence],
      sourceFile,
    );
  }
  return resolveSelectedTypeArguments(
    types,
    source.sourceSelectedMethodTypeArguments ?? [],
    relation.bindingTypeParameters,
    relation.targetBinding.typeParameters?.length ?? 0,
    sourceFile,
  )?.map((argument) => argument.targetType);
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
    const sourcePassingMode = csharpSourceArgumentPassingMode(
      sourceFacts,
      sourceParameter.parameterDeclaration ?? sourceParameter.parameterSymbol,
    );
    if (
      sourcePassingMode !== parameterRelation.sourcePassingMode ||
      targetParameter.passingMode !== parameterRelation.targetPassingMode ||
      sourceParameter.acceptsOmission !==
        parameterRelation.sourceAcceptsOmission ||
      (targetParameter.optional === true ||
        targetParameter.csharpOmittableOptionalArgument === true ||
        targetParameter.paramsArray === true) !==
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
): readonly CsharpSelectedTargetMethodTypeArgument[] | undefined {
  const sourceArguments = source.sourceSelectedMethodTypeArguments ?? [];
  if (
    relation.bindingTypeArgumentSource ===
      "selected-operation-type-arguments"
  ) {
    return relation.methodTypeParameters.length === 0 &&
        (relation.targetMember.typeParameters?.length ?? 0) === 0
      ? []
      : undefined;
  }
  const targetArity = relation.targetMember.typeParameters?.length ?? 0;
  return resolveSelectedTypeArguments(
    types,
    sourceArguments,
    relation.methodTypeParameters,
    targetArity,
    sourceFile,
  );
}

function resolveSelectedTypeArguments(
  types: CsharpTypePolicy,
  sourceArguments: ReadonlyArray<NonNullable<
    ResolvedSourceCallInfo["sourceSelectedMethodTypeArguments"]
  >[number]>,
  relations: CsharpProviderSignatureRelation[
    "bindingTypeParameters"
  ],
  targetArity: number,
  sourceFile: SourceFile,
): readonly CsharpSelectedTargetMethodTypeArgument[] | undefined {
  if (
    sourceArguments.length !== relations.length ||
    relations.length !== targetArity
  ) {
    return undefined;
  }
  const targetArguments: (CsharpSelectedTargetMethodTypeArgument | undefined)[] =
    Array.from({ length: targetArity });
  for (const typeParameterRelation of relations) {
    const sourceArgument =
      sourceArguments[typeParameterRelation.sourceTypeParameterIndex];
    if (
      sourceArgument === undefined ||
      targetArguments[typeParameterRelation.targetTypeParameterIndex] !==
        undefined
    ) {
      return undefined;
    }
    const targetArgument = types.resolveSelectedType(
      sourceArgument.explicitTypeNode,
      sourceArgument.selectedType,
      sourceFile,
    );
    if (targetArgument === undefined) {
      return undefined;
    }
    targetArguments[typeParameterRelation.targetTypeParameterIndex] = {
      kind: "selected-source",
      targetType: targetArgument,
      selectedType: sourceArgument.selectedType,
      ...(sourceArgument.explicitTypeNode === undefined
        ? {}
        : { explicitTypeNode: sourceArgument.explicitTypeNode }),
    };
  }
  return targetArguments.every(
      (argument): argument is CsharpSelectedTargetMethodTypeArgument =>
        argument !== undefined,
    )
    ? targetArguments
    : undefined;
}

function targetTypeParameterSubstitutions(
  relation: CsharpProviderSignatureRelation,
  bindingArguments: readonly TargetTypeRef[],
  methodArguments: readonly CsharpSelectedTargetMethodTypeArgument[],
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
    methodSubstitutions.set(parameter.name, argument.targetType);
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

type CsharpProviderArgumentValidation =
  | {
      readonly kind: "accepted";
      readonly argumentMappings: readonly CsharpProviderArgumentMapping[];
    }
  | { readonly kind: "rejected"; readonly reason: string };

function validateArgumentsTargetSelectedParameters(
  host: CsharpProviderCallInstantiationHost,
  relation: CsharpProviderSignatureRelation,
  targetMember: CsharpTargetMember,
  source: ResolvedSourceCallInfo,
  arguments_: readonly CsharpSelectedCallArgument[],
  sourceFile: SourceFile,
): CsharpProviderArgumentValidation {
  const argumentMappings: CsharpProviderArgumentMapping[] = [];
  for (const argument of arguments_) {
    const binding = source.sourceArgumentBindings.find((candidate) =>
      candidate.effectiveArgumentIndex === argument.effectiveArgumentIndex);
    if (binding === undefined) {
      return {
        kind: "rejected",
        reason:
          `Effective source argument ${argument.effectiveArgumentIndex} has no exact checker-selected parameter binding.`,
      };
    }
    const sourceExpression = source.sourceArguments[
      binding.sourceArgumentIndex
    ]?.expression;
    if (sourceExpression === undefined) {
      return {
        kind: "rejected",
        reason:
          `Source argument ${binding.sourceArgumentIndex} has no exact checker-owned expression.`,
      };
    }
    const sourceArgument = selectCsharpSourceArgument(
      host.sourceFacts,
      sourceExpression,
    );
    if (sourceArgument.kind === "rejected") {
      return {
        kind: "rejected",
        reason:
          `Source argument ${binding.sourceArgumentIndex} is invalid. ${sourceArgument.reason}`,
      };
    }
    if (
      sourceArgument.argument.passingMode !==
        argument.targetParameter.passingMode
    ) {
      return {
        kind: "rejected",
        reason:
          `Source argument ${binding.sourceArgumentIndex} uses '${sourceArgument.argument.passingMode}', but exact target parameter '${argument.targetParameter.name}' requires '${argument.targetParameter.passingMode}'.`,
      };
    }
    if (
      argument.targetParameter.csharpAcceptsCheckedSourceArgument === true &&
      sourceArgument.argument.passingMode === "by-value"
    ) {
      continue;
    }
    const sourceType = host.types.resolveNode(
      sourceArgument.argument.storageExpression,
      sourceFile,
    ) ?? (sourceArgument.argument.passingMode === "by-value"
      ? host.types.resolveType(
          binding.selectedArgumentType,
          sourceFile,
        )
      : undefined);
    if (sourceType === undefined) {
      return {
        kind: "rejected",
        reason:
          `Source argument ${binding.sourceArgumentIndex} has no closed C# representation for its exact selected target parameter '${argument.targetParameter.name}'.`,
      };
    }
    const targetType = csharpTargetParameterValueType(
      argument.targetParameter,
      argument.sourceForm,
    );
    const parameterRelation = relation.parameters.find((candidate) =>
      candidate.targetParameterIndex === argument.targetParameterIndex);
    if (sourceArgument.argument.passingMode !== "by-value") {
      if (!csharpTargetStorageIdentityEquals(sourceType, targetType)) {
        return {
          kind: "rejected",
          reason:
            `Source argument ${binding.sourceArgumentIndex} with C# representation '${targetTypeRefKey(sourceType)}' cannot satisfy exact target parameter '${argument.targetParameter.name}' with passing mode '${sourceArgument.argument.passingMode}' and representation '${targetTypeRefKey(targetType)}'. Exact C# by-reference passing requires one CLR storage identity; nullable-reference annotations may differ, but the underlying storage type may not.`,
        };
      }
      argumentMappings.push({
        kind: "by-reference",
        effectiveArgumentIndex: argument.effectiveArgumentIndex,
        sourceType,
        targetType,
        passingMode: sourceArgument.argument.passingMode,
        proof: "storage-identity",
      });
      continue;
    }
    const conversion = selectCsharpProviderArgumentConversion(
      host,
      sourceArgument.argument.storageExpression,
      sourceType,
      targetType,
      parameterRelation?.argumentAdapter,
    );
    if (
      conversion.kind !== "identity" &&
      conversion.kind !== "implicit" &&
      conversion.kind !== "delegate-adapter" &&
      conversion.kind !== "provider-argument-adapter" &&
      conversion.kind !== "lifted-provider-argument-adapter"
    ) {
      const detail = conversion.kind === "rejected" ||
          conversion.kind === "ambiguous"
        ? ` ${conversion.reason}`
        : "";
      return {
        kind: "rejected",
        reason:
          `Source argument ${binding.sourceArgumentIndex} with C# representation '${targetTypeRefKey(sourceType)}' cannot satisfy exact target parameter '${argument.targetParameter.name}' with passing mode '${sourceArgument.argument.passingMode}' and representation '${targetTypeRefKey(csharpTargetParameterValueType(argument.targetParameter, argument.sourceForm))}'.${detail}`,
      };
    }
    argumentMappings.push({
      kind: "by-value",
      effectiveArgumentIndex: argument.effectiveArgumentIndex,
      sourceType,
      targetType: csharpTargetParameterValueType(
        argument.targetParameter,
        argument.sourceForm,
      ),
      conversion,
    });
  }
  if (!everyRequiredTargetParameterIsSupplied(targetMember, arguments_)) {
    return {
      kind: "rejected",
      reason:
        `The selected source call does not supply every required parameter of exact target member '${targetMember.id}'.`,
    };
  }
  return {
    kind: "accepted",
    argumentMappings: Object.freeze(argumentMappings),
  };
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
