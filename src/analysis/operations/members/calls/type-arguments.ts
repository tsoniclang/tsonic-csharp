import type { Node, SourceFile, Type } from "@tsonic/tsts";

import type { CsharpProviderTargetRelation } from "../../../../target-model/identities/provider-relations.js";
import type { TargetTypeRef } from "../../../../policy/types/index.js";

import type { SourceTypeDescriptor } from "@tsonic/target-api/source";

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
        : { node: source.call, type: source.sourceResultType };
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
      const outcome = evidence.node === undefined ? undefined : host.effectiveTypes.get(evidence.node);
      let descriptor = outcome?.kind === "refused" ? undefined : outcome?.type;
      while (descriptor?.kind === "optional") descriptor = descriptor.value;
      const argument = descriptor?.kind === "declared" ? descriptor.typeArguments[index] : undefined;
      if (argument === undefined) return { kind: "target-derived" as const, targetType };
      return {
            kind: "selected-source" as const,
            targetType,
            selectedType,
            descriptor: argument,
          };
    });
    return Object.freeze(resolved);
  }
  return resolveSelectedTypeArguments(
    source.sourceSelectedMethodTypeArguments ?? [],
    relation.bindingTypeParameters,
    relation.targetBinding.typeParameters?.length ?? 0,
    relation.selectedTypeParameterCount,
    host.types.resolveSourceCallTypeArguments(source, sourceFile),
    selectedDescriptors(host, source, sourceFile),
  );
}

export function resolveMethodTypeArguments(
  host: CsharpProviderCallInstantiationHost,
  relation: CsharpProviderSignatureRelation,
  source: ResolvedSourceCallInfo,
  sourceFile: SourceFile,
): readonly CsharpSelectedTargetMethodTypeArgument[] | undefined {
  const sourceArguments = source.sourceSelectedMethodTypeArguments ?? [];
  const targetArity = relation.targetMember.typeParameters?.length ?? 0;
  return resolveSelectedTypeArguments(
    sourceArguments,
    relation.methodTypeParameters,
    targetArity,
    relation.selectedTypeParameterCount,
    host.types.resolveSourceCallTypeArguments(source, sourceFile),
    selectedDescriptors(host, source, sourceFile),
  );
}

export function resolveInvocationTypeArguments(
  host: CsharpProviderCallInstantiationHost,
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
    source.sourceSelectedMethodTypeArguments ?? [],
    relation.invocationTypeParameters,
    targetArity,
    relation.selectedTypeParameterCount,
    host.types.resolveSourceCallTypeArguments(source, sourceFile),
    selectedDescriptors(host, source, sourceFile),
  );
}

function resolveSelectedTypeArguments(
  sourceArguments: readonly {
    readonly selectedType: Type;
    readonly explicitTypeNode?: Node;
  }[],
  relations: CsharpProviderSignatureRelation[
    "bindingTypeParameters"
  ],
  targetArity: number,
  sourceArity: number,
  nativeArguments: readonly TargetTypeRef[] | undefined,
  descriptors: readonly SourceTypeDescriptor[] | undefined,
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
    const targetArgument = nativeArguments?.[typeParameterRelation.sourceTypeParameterIndex];
    const descriptor = descriptors?.[typeParameterRelation.sourceTypeParameterIndex];
    if (targetArgument === undefined || descriptor === undefined) {
      return undefined;
    }
    targetArguments[typeParameterRelation.targetTypeParameterIndex] = {
      kind: "selected-source",
      targetType: targetArgument,
      selectedType: sourceArgument.selectedType,
      descriptor,
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

function selectedDescriptors(
  host: CsharpProviderCallInstantiationHost,
  source: ResolvedSourceCallInfo,
  sourceFile: SourceFile,
): readonly SourceTypeDescriptor[] | undefined {
  const publication = host.effectiveTypes.callInstantiation(source.call);
  const selected = source.sourceSelectedMethodTypeArguments ?? [];
  if (selected.length === 0) return Object.freeze([]);
  if (publication === undefined || publication.call !== source) return undefined;
  const queries = host.semantics(sourceFile);
  const descriptors: SourceTypeDescriptor[] = [];
  for (const argument of selected) {
    const symbol = queries.declarations.typeSymbol(argument.typeParameter);
    const declarations = symbol === undefined ? [] : queries.declarations.symbolDeclarations(symbol);
    const matches = publication.method.filter(parameter => declarations.includes(parameter.declaration));
    if (matches.length !== 1) return undefined;
    descriptors.push(matches[0]!.type);
  }
  return Object.freeze(descriptors);
}
