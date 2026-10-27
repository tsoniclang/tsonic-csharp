import type { Node, SourceFile, Type } from "@tsonic/tsts";

import type { CsharpProviderTargetRelation } from "../../../../target-model/identities/provider-relations.js";
import type { TargetTypeRef } from "../../../../policy/types/index.js";

import type { CsharpTypeQueries } from "../../../../policy/model/type-resolution.js";

import { csharpTargetBindingSubstitutions, csharpTargetParameterValueType, substituteCsharpTargetMember, targetTypeRefEquals } from "../../../../policy/types/index.js";

import { selectCsharpCommonImplicitTarget } from "../../../conversions/common-target.js";

import { inferCsharpTargetTypeParameterBindings } from "../../../../policy/types/resolution/substitution.js";

import { resolveCsharpTargetBindingArguments } from "./binding-instantiation.js";

import type { CsharpSelectedTargetMethodTypeArgument } from "../../../../target-model/records/objects/members.js";
import type { ResolvedSourceCallInfo } from "../../../../target-model/records/calls/source-calls.js";

type CsharpProviderSignatureRelation = Extract<
  CsharpProviderTargetRelation,
  { readonly kind: "signature" }
>;

import type { CsharpProviderCallInstantiationHost } from "../../../../policy/model/provider-calls.js";
export function resolveProviderBindingTypeArguments(
  host: CsharpProviderCallInstantiationHost,
  relation: CsharpProviderSignatureRelation,
  source: ResolvedSourceCallInfo,
  sourceFile: SourceFile,
): readonly CsharpSelectedTargetMethodTypeArgument[] | undefined {
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
    const targetArguments = resolveCsharpTargetBindingArguments(
      host.types,
      relation.targetBinding,
      [evidence],
      sourceFile,
    );
    if (targetArguments === undefined) {
      return undefined;
    }
    if (targetArguments.length === 0) {
      return Object.freeze([]);
    }
    const sourceArguments = evidence.type === undefined
      ? undefined
      : host.semantics(sourceFile).types.effectiveTypeArguments(evidence.type);
    if (
      sourceArguments === undefined ||
      sourceArguments.length !== targetArguments.length
    ) {
      return targetArguments.map((targetType) => ({
        kind: "target-derived",
        targetType,
      }));
    }
    const resolved = sourceArguments.map((selectedType, index) => {
      const targetType = targetArguments[index]!;
      const selectedTarget = host.types.resolveType(selectedType, sourceFile);
      return selectedTarget !== undefined &&
          targetTypeRefEquals(selectedTarget, targetType)
        ? {
            kind: "selected-source" as const,
            targetType,
            selectedType,
          }
        : { kind: "target-derived" as const, targetType };
    });
    return Object.freeze(resolved);
  }
  return resolveSelectedTypeArguments(
    host.types,
    source.sourceSelectedMethodTypeArguments ?? [],
    relation.bindingTypeParameters,
    relation.targetBinding.typeParameters?.length ?? 0,
    relation.selectedTypeParameterCount,
    sourceFile,
  );
}

export function resolveMethodTypeArguments(
  host: CsharpProviderCallInstantiationHost,
  relation: CsharpProviderSignatureRelation,
  source: ResolvedSourceCallInfo,
  sourceFile: SourceFile,
  bindingArguments: readonly TargetTypeRef[],
): readonly CsharpSelectedTargetMethodTypeArgument[] | undefined {
  const sourceArguments = source.sourceSelectedMethodTypeArguments ?? [];
  const targetArity = relation.targetMember.typeParameters?.length ?? 0;
  const bindingSubstitutions = csharpTargetBindingSubstitutions(relation.targetBinding, bindingArguments);
  if (bindingSubstitutions === undefined) return undefined;
  const member = substituteCsharpTargetMember(relation.targetMember, bindingSubstitutions);
  const inferredSourceArguments = new Map(relation.methodTypeParameters.flatMap(mapping => {
    const selected = sourceArguments[mapping.sourceTypeParameterIndex];
    const parameter = member.typeParameters?.[mapping.targetTypeParameterIndex];
    return selected !== undefined && selected.explicitTypeNode === undefined && parameter !== undefined
      ? [[parameter.identity, selected] as const] : [];
  }));
  const inferredNames = new Set(inferredSourceArguments.keys());
  const bounds = new Map<string, TargetTypeRef[]>();
  if (inferredNames.size !== 0) {
    for (const binding of source.sourceArgumentBindings) {
      const mapping = relation.parameters.find(value => value.sourceParameterIndex === binding.sourceParameterIndex);
      const parameter = mapping === undefined ? undefined : member.parameters[mapping.targetParameterIndex];
      const argument = source.sourceArguments[binding.sourceArgumentIndex];
      if (parameter === undefined || argument === undefined) return undefined;
      const actual = host.types.resolveSelectedValue(argument.expression, argument.type, sourceFile);
      if (actual === undefined) continue;
      const candidates = inferCsharpTargetTypeParameterBindings(
        csharpTargetParameterValueType(parameter, binding.sourceForm), actual, inferredNames);
      for (const [name, carrier] of candidates ?? []) {
        const previous = bounds.get(name);
        if (previous === undefined) bounds.set(name, [carrier]);
        else previous.push(carrier);
      }
    }
  }
  const inferred = new Map<string, TargetTypeRef>();
  for (const [name, candidates] of bounds) {
    const selected = inferredSourceArguments.get(name)!;
    const selectedTarget = host.types.resolveSelectedType(undefined, selected.selectedType, sourceFile);
    const common = selectCsharpCommonImplicitTarget(host, candidates,
      selectedTarget === undefined ? candidates : [...candidates, selectedTarget]);
    if (common.kind === "rejected") return undefined;
    inferred.set(name, common.target);
  }
  const refinements = new Map(relation.methodTypeParameters.flatMap(mapping => {
    const parameter = member.typeParameters?.[mapping.targetTypeParameterIndex];
    const carrier = parameter === undefined ? undefined : inferred.get(parameter.identity);
    return carrier === undefined ? [] : [[mapping.sourceTypeParameterIndex, carrier] as const];
  }));
  return resolveSelectedTypeArguments(
    host.types,
    sourceArguments,
    relation.methodTypeParameters,
    targetArity,
    relation.selectedTypeParameterCount,
    sourceFile,
    refinements,
  );
}

export function resolveInvocationTypeArguments(
  types: CsharpTypeQueries,
  relation: CsharpProviderSignatureRelation,
  source: ResolvedSourceCallInfo,
  sourceFile: SourceFile,
): readonly CsharpSelectedTargetMethodTypeArgument[] | undefined {
  const targetArity = relation.targetMember.csharpInvocation?.kind ===
      "static-member" &&
      relation.targetMember.csharpInvocation.receiver.kind ===
        "invocation-type-argument"
    ? 1
    : 0;
  return resolveSelectedTypeArguments(
    types,
    source.sourceSelectedMethodTypeArguments ?? [],
    relation.invocationTypeParameters,
    targetArity,
    relation.selectedTypeParameterCount,
    sourceFile,
  );
}

function resolveSelectedTypeArguments(
  types: CsharpTypeQueries,
  sourceArguments: readonly {
    readonly selectedType: Type;
    readonly explicitTypeNode?: Node;
  }[],
  relations: CsharpProviderSignatureRelation[
    "bindingTypeParameters"
  ],
  targetArity: number,
  sourceArity: number,
  sourceFile: SourceFile,
  refinements: ReadonlyMap<number, TargetTypeRef> = new Map(),
): readonly CsharpSelectedTargetMethodTypeArgument[] | undefined {
  if (
    sourceArguments.length !== sourceArity ||
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
    const targetArgument = refinements.get(typeParameterRelation.sourceTypeParameterIndex) ?? types.resolveSelectedType(
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
