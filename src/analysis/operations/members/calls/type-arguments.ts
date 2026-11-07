// Provider call type arguments from the Host per-use instantiation (facts.instantiations.at(use), G4/E4-7).
// No checker-selected type arguments are read (I2); the C# arguments are the represented Host descriptors.
import type { Node } from "@tsonic/tsts";
import type { SourceCallSelection, SourceEffectiveTypeArgument, SourceTypeDescriptor } from "@tsonic/target-api/source";

import type { CsharpProviderTargetRelation } from "../../../../target-model/identities/provider-relations.js";
import type { TargetTypeRef } from "../../../../policy/types/index.js";
import type { CsharpProviderCallInstantiationHost } from "../../../../policy/model/provider-calls.js";
import type { CsharpSelectedTargetMethodTypeArgument } from "../../../../target-model/records/objects/members.js";
import { sourceInstantiation, sourceValueType } from "../../../program/source-facts.js";

import { resolveCsharpTargetBindingArguments } from "./binding-instantiation.js";

type CsharpProviderSignatureRelation = Extract<
  CsharpProviderTargetRelation,
  { readonly kind: "signature" }
>;

/** The Host method binders of a use with the authored explicit type-argument node, when the call spells one. */
interface CsharpSourceMethodTypeArgument {
  readonly binder: SourceEffectiveTypeArgument;
  readonly target: TargetTypeRef | undefined;
  readonly explicitTypeNode?: Node;
}

export function resolveProviderBindingTypeArguments(
  host: CsharpProviderCallInstantiationHost,
  relation: CsharpProviderSignatureRelation,
  source: SourceCallSelection,
): readonly CsharpSelectedTargetMethodTypeArgument[] | undefined {
  if (relation.bindingTypeArgumentSource !== "selected-operation-type-arguments") {
    const node = relation.bindingTypeArgumentSource === "receiver" ? source.receiver
      : relation.bindingTypeArgumentSource === "callee" ? source.callee
        : source.use;
    const targetArguments = resolveCsharpTargetBindingArguments(host.types, relation.targetBinding, [{ node }]);
    if (targetArguments === undefined) return undefined;
    if (targetArguments.length === 0) return Object.freeze([]);
    let descriptor: SourceTypeDescriptor | undefined = node === undefined ? undefined : sourceValueType(host.facts, node);
    while (descriptor?.kind === "optional") descriptor = descriptor.value;
    const sourceArguments = descriptor?.kind === "declared" ? descriptor.typeArguments : undefined;
    if (sourceArguments === undefined || sourceArguments.length !== targetArguments.length) {
      return Object.freeze(targetArguments.map((targetType) => ({ kind: "target-derived" as const, targetType })));
    }
    return Object.freeze(sourceArguments.map((argument, index) => ({
      kind: "selected-source" as const,
      targetType: targetArguments[index]!,
      descriptor: argument,
    })));
  }
  return resolveSelectedTypeArguments(
    sourceMethodTypeArguments(host, source),
    relation.bindingTypeParameters,
    relation.targetBinding.typeParameters?.length ?? 0,
    relation.selectedTypeParameterCount,
  );
}

export function resolveMethodTypeArguments(
  host: CsharpProviderCallInstantiationHost,
  relation: CsharpProviderSignatureRelation,
  source: SourceCallSelection,
): readonly CsharpSelectedTargetMethodTypeArgument[] | undefined {
  return resolveSelectedTypeArguments(
    sourceMethodTypeArguments(host, source),
    relation.methodTypeParameters,
    relation.targetMember.typeParameters?.length ?? 0,
    relation.selectedTypeParameterCount,
  );
}

export function resolveInvocationTypeArguments(
  host: CsharpProviderCallInstantiationHost,
  relation: CsharpProviderSignatureRelation,
  source: SourceCallSelection,
): readonly CsharpSelectedTargetMethodTypeArgument[] | undefined {
  const targetArity = relation.targetMember.csharpInvocation?.kind === "static-member" &&
      relation.targetMember.csharpInvocation.receiver.kind === "invocation-type-argument"
    ? 1
    : 0;
  return resolveSelectedTypeArguments(
    sourceMethodTypeArguments(host, source),
    relation.invocationTypeParameters,
    targetArity,
    relation.selectedTypeParameterCount,
  );
}

/** The Host method binders of the selected signature, in declaration order, with their represented C# arguments. */
export function sourceMethodTypeArguments(
  host: CsharpProviderCallInstantiationHost,
  source: SourceCallSelection,
): readonly CsharpSourceMethodTypeArgument[] {
  const instantiation = sourceInstantiation(host.facts, source.use);
  if (instantiation === undefined || instantiation.method.length === 0) return Object.freeze([]);
  const represented = host.types.instantiation(source.use)?.method;
  const explicit = host.ast.typeArguments(source.use);
  return Object.freeze(instantiation.method.map((binder, index) => {
    const target = represented?.[index];
    return Object.freeze({
      binder,
      target: target === undefined || target.kind === "csharp-refused" ? undefined : target,
      ...(explicit.length === instantiation.method.length ? { explicitTypeNode: explicit[index]! } : {}),
    });
  }));
}

function resolveSelectedTypeArguments(
  sourceArguments: readonly CsharpSourceMethodTypeArgument[],
  relations: CsharpProviderSignatureRelation["bindingTypeParameters"],
  targetArity: number,
  sourceArity: number,
): readonly CsharpSelectedTargetMethodTypeArgument[] | undefined {
  if (sourceArguments.length !== sourceArity || relations.length !== targetArity) return undefined;
  const targetArguments: (CsharpSelectedTargetMethodTypeArgument | undefined)[] = Array.from({ length: targetArity });
  for (const typeParameterRelation of relations) {
    const sourceArgument = sourceArguments[typeParameterRelation.sourceTypeParameterIndex];
    if (sourceArgument === undefined || targetArguments[typeParameterRelation.targetTypeParameterIndex] !== undefined) {
      return undefined;
    }
    if (sourceArgument.target === undefined) return undefined;
    targetArguments[typeParameterRelation.targetTypeParameterIndex] = {
      kind: "selected-source",
      targetType: sourceArgument.target,
      descriptor: sourceArgument.binder.type,
      ...(sourceArgument.explicitTypeNode === undefined ? {} : { explicitTypeNode: sourceArgument.explicitTypeNode }),
    };
  }
  return targetArguments.every((argument): argument is CsharpSelectedTargetMethodTypeArgument => argument !== undefined)
    ? targetArguments
    : undefined;
}
