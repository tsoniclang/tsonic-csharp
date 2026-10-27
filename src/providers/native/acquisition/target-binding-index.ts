import type { CsharpTargetBindingFact, TargetBindingFact, TargetTypeParameter } from "../../../target-model/types/model.js";
import { isCsharpTargetTypeRef } from "../../../target-model/types/snapshot.js";
import type { DotnetModuleModel, DotnetTypeDeclaration } from "../model/index.js";
import { dotnetExportToTargetBinding } from "../projection/index.js";
import type { DotnetTargetBindingFact } from "../projection/index.js";
import { dotnetTypeTargetMemberProjections, providerSignatureProjectionKey } from "../projection/target-relations.js";
import { dotnetFunctionToTargetMemberRecords } from "../projection/members.js";
import type { DotnetTargetMemberProjection, DotnetTargetFunctionProjection, DotnetTargetRelationLookup } from "../projection/target-relations.js";
import type { DotnetProviderCacheRequest } from "./cache.js";
import type { DotnetProviderDiagnostic } from "../model/provider.js";
import { dotnetTypeDeclarationIsComplete } from "./module-request-validation.js";
import { canonicalProviderValue } from "../../../target-model/metadata/canonical-value.js";
import { diagnostic } from "../model/diagnostics.js";
import type { CsharpProviderBindingResolution } from "../../../target-model/metadata/provider-metadata.js";
import { dotnetExtensionDiagnostic } from "../model/diagnostics.js";
import { dotnetReflectionProviderIdentity } from "./provider-identity.js";

export interface DotnetTargetBindingIndex extends DotnetTargetRelationLookup {
  readonly rememberModule: (module: DotnetModuleModel, request: DotnetProviderCacheRequest) => DotnetProviderDiagnostic | undefined;
  readonly getByTargetId: (targetId: string) => TargetBindingFact | undefined;
  readonly getCompleteCandidatesByMetadataName: (metadataName: string) => readonly TargetBindingFact[];
}

export function createDotnetTargetBindingIndex(): DotnetTargetBindingIndex {
  const targetBindingsByTargetId = new Map<string, TargetBindingFact>();
  const completeTargetIds = new Set<string>();
  const targetIdsByMetadataName = new Map<string, Set<string>>();
  const memberProjectionsByProviderId = new Map<string, DotnetTargetMemberProjection[]>();
  const signatureProjectionsByProviderId = new Map<string, DotnetTargetMemberProjection[]>();
  const canonicalSignatureProjectionsByProviderId = new Map<
    string,
    DotnetTargetMemberProjection[]
  >();
  const functionProjectionsByProviderId = new Map<string, DotnetTargetFunctionProjection[]>();

  function rememberModule(module: DotnetModuleModel, request: DotnetProviderCacheRequest): DotnetProviderDiagnostic | undefined {
    const targetOnlyDeclarations = new Set(module.targetOnlyTypes ?? []);
    const prepared: {
      readonly declaration: DotnetTypeDeclaration;
      readonly binding: TargetBindingFact;
    }[] = [];
    const candidates = new Map<string, TargetBindingFact>();
    for (const declaration of [...module.exports, ...targetOnlyDeclarations]) {
      if (declaration.kind !== "type") {
        continue;
      }
      const binding = dotnetExportToTargetBinding(declaration);
      if (binding === undefined) {
        continue;
      }
      const existing = candidates.get(binding.id) ?? targetBindingsByTargetId.get(binding.id);
      if (existing !== undefined) {
        const previous = existing as DotnetTargetBindingFact;
        const candidate = binding as DotnetTargetBindingFact;
        if (canonicalProviderValue(previous.csharpInheritance) !== canonicalProviderValue(candidate.csharpInheritance) ||
          previous.csharpInheritableMembers !== undefined && candidate.csharpInheritableMembers !== undefined &&
          canonicalProviderValue(previous.csharpInheritableMembers) !== canonicalProviderValue(candidate.csharpInheritableMembers)) {
          return diagnostic("DOTNET_REFLECTION_NATIVE_INHERITANCE_CONFLICT", ".NET reflection provider supplied contradictory native inheritance metadata.", {
            targetId: binding.id,
            specifier: request.moduleSpecifier,
          });
        }
      }
      const mergedTargetBinding = mergeTargetBindingFacts(existing, binding);
      candidates.set(binding.id, mergedTargetBinding);
      prepared.push({ declaration, binding: mergedTargetBinding });
    }
    for (const { declaration, binding: mergedTargetBinding } of prepared) {
      targetBindingsByTargetId.set(mergedTargetBinding.id, mergedTargetBinding);
      if (targetOnlyDeclarations.has(declaration) || dotnetTypeDeclarationIsComplete(declaration, request)) {
        completeTargetIds.add(mergedTargetBinding.id);
      }
      const targetIds = targetIdsByMetadataName.get(declaration.metadataName) ?? new Set<string>();
      targetIds.add(mergedTargetBinding.id);
      targetIdsByMetadataName.set(declaration.metadataName, targetIds);
      const projections = dotnetTypeTargetMemberProjections(declaration);
      for (const [memberId, candidates] of projections.memberProjections) {
        for (const candidate of candidates) {
          rememberProjection(memberProjectionsByProviderId, memberId, candidate);
        }
      }
      for (const [signatureId, candidates] of projections.signatureProjections) {
        for (const candidate of candidates) {
          rememberProjection(signatureProjectionsByProviderId, signatureId, candidate);
        }
      }
      for (
        const [signatureId, candidates] of
          projections.canonicalSignatureProjections
      ) {
        for (const candidate of candidates) {
          rememberProjection(
            canonicalSignatureProjectionsByProviderId,
            signatureId,
            candidate,
          );
        }
      }
    }
    for (const declaration of module.exports) {
      if (declaration.kind !== "function") {
        continue;
      }
      const targetBinding = targetBindingsByTargetId.get(
        declaration.targetBindingId,
      ) as CsharpTargetBindingFact | undefined;
      if (targetBinding === undefined) {
        continue;
      }
      const signaturesBySourceId = new Map(
        declaration.signatures.map((signature) => [signature.sourceId, signature]),
      );
      for (const record of dotnetFunctionToTargetMemberRecords(declaration)) {
        if (record.kind !== "signature") {
          continue;
        }
        const signature = signaturesBySourceId.get(record.sourceSignatureId);
        const roles = signature?.sourceTypeParameterRoles;
        const sourceTypeParameterCount =
          (signature?.sourceTypeParameters ?? signature?.typeParameters)?.length ?? 0;
        if (signature === undefined || roles === undefined) {
          continue;
        }
        rememberProjection(
          functionProjectionsByProviderId,
          providerSignatureProjectionKey(
            declaration.targetId,
            signature.sourceId,
          ),
          {
            targetBinding,
            targetMember: record.targetMember,
            bindingTypeParameters: typeParameterRelations(roles.binding),
            methodTypeParameters: typeParameterRelations(roles.method),
            invocationTypeParameters: typeParameterRelations(roles.invocation),
            selectedTypeParameterCount: sourceTypeParameterCount,
          },
        );
      }
    }
    return undefined;
  }

  return {
    rememberModule,
    getByTargetId(targetId: string): TargetBindingFact | undefined {
      return completeTargetIds.has(targetId)
        ? targetBindingsByTargetId.get(targetId)
        : undefined;
    },
    getTargetBinding(exportId: string): CsharpTargetBindingFact | undefined {
      return targetBindingsByTargetId.get(exportId) as CsharpTargetBindingFact | undefined;
    },
    getCompleteCandidatesByMetadataName(metadataName: string): readonly TargetBindingFact[] {
      return Object.freeze([...(targetIdsByMetadataName.get(metadataName) ?? [])].flatMap(targetId => {
        const binding = completeTargetIds.has(targetId) ? targetBindingsByTargetId.get(targetId) : undefined;
        return binding === undefined ? [] : [binding];
      }));
    },
    getTargetMembersForProviderMember(memberId: string): readonly DotnetTargetMemberProjection[] {
      return memberProjectionsByProviderId.get(memberId) ?? [];
    },
    getTargetMembersForProviderSignature(
      memberId: string,
      signatureId: string,
    ): readonly DotnetTargetMemberProjection[] {
      const direct = signatureProjectionsByProviderId.get(
        providerSignatureProjectionKey(memberId, signatureId),
      );
      return direct !== undefined && direct.length > 0
        ? direct
        : canonicalSignatureProjectionsByProviderId.get(signatureId) ?? [];
    },
    getTargetFunctionsForProviderSignature(
      exportId: string,
      signatureId: string,
    ): readonly DotnetTargetFunctionProjection[] {
      return functionProjectionsByProviderId.get(
        providerSignatureProjectionKey(exportId, signatureId),
      ) ?? [];
    },
  };
}

export function isCsharpProviderTargetBinding(binding: TargetBindingFact): binding is CsharpTargetBindingFact {
  const permissions = (parameter: TargetTypeParameter): boolean =>
    "csharpAllowsRefLike" in parameter && typeof parameter.csharpAllowsRefLike === "boolean";
  return (binding.typeParameters?.every(permissions) ?? true) &&
    (binding.members?.every(member => member.typeParameters?.every(permissions) ?? true) ?? true) &&
    (!("csharpType" in binding) || binding.csharpType === undefined || isCsharpTargetTypeRef(binding.csharpType));
}

export function findUniqueTargetBinding(
  candidates: readonly CsharpProviderBindingResolution[],
  query: string,
): CsharpProviderBindingResolution {
  const bindings = candidates.flatMap(candidate => candidate.kind === "resolved" ? [candidate.binding] : []);
  if (bindings.length === 0) {
    return candidates.find(candidate => candidate.kind === "rejected") ?? Object.freeze({ kind: "missing" });
  }
  const first = bindings[0]!;
  const canonical = canonicalProviderValue(first);
  return bindings.every(binding => canonicalProviderValue(binding) === canonical)
    ? Object.freeze({ kind: "resolved", binding: first })
    : Object.freeze({ kind: "rejected", diagnostic: dotnetExtensionDiagnostic(
        dotnetReflectionProviderIdentity.id,
        "CSHARP_PROVIDER_TARGET_BINDING_CONFLICT",
        9200000,
        "C# providers supplied contradictory complete target binding evidence.",
        [{ query, bindingIds: bindings.map(binding => binding.id) }],
      ) });
}

function typeParameterRelations(
  sourceIndexes: readonly number[],
): readonly { readonly sourceTypeParameterIndex: number; readonly targetTypeParameterIndex: number }[] {
  return Object.freeze(sourceIndexes.map((sourceTypeParameterIndex, targetTypeParameterIndex) => ({
    sourceTypeParameterIndex,
    targetTypeParameterIndex,
  })));
}

function rememberProjection<TProjection extends DotnetTargetMemberProjection>(
  index: Map<string, TProjection[]>,
  key: string,
  projection: TProjection,
): void {
  const existing = index.get(key) ?? [];
  if (!existing.some((candidate) =>
    candidate.targetBinding.id === projection.targetBinding.id &&
    candidate.targetMember.id === projection.targetMember.id)) {
    existing.push(projection);
    index.set(key, existing);
  }
}

function mergeTargetBindingFacts(
  existing: TargetBindingFact | undefined,
  candidate: TargetBindingFact,
): TargetBindingFact {
  if (existing === undefined) {
    return candidate;
  }
  const existingDotnet = existing as DotnetTargetBindingFact;
  const candidateDotnet = candidate as DotnetTargetBindingFact;
  const members = mergeByKey(existingDotnet.members, candidateDotnet.members, (member) => member.id);
  const attributes = mergeByKey(existingDotnet.attributes, candidateDotnet.attributes, (attribute) => attribute.id);
  const unsupportedAttributes = mergeByKey(
    existingDotnet.unsupportedAttributes,
    candidateDotnet.unsupportedAttributes,
    (attribute) => attribute.id,
  );
  const typeParameters = mergeByKey(existingDotnet.typeParameters, candidateDotnet.typeParameters, (parameter) => parameter.name);
  const implementedContracts = mergeByStableShape(existingDotnet.implementedContracts, candidateDotnet.implementedContracts);
  const unsupportedImplementedContracts = mergeByKey(
    existingDotnet.unsupportedImplementedContracts,
    candidateDotnet.unsupportedImplementedContracts,
    (constraint) => constraint.targetId,
  );
  const unsupportedMembers = mergeByKey(
    existingDotnet.unsupportedMembers,
    candidateDotnet.unsupportedMembers,
    (member) => member.targetId,
  );
  const conversionOperators = mergeByKey(
    existingDotnet.conversionOperators,
    candidateDotnet.conversionOperators,
    (operator) => operator.id,
  );
  return {
    ...existingDotnet,
    ...candidateDotnet,
    ...(members !== undefined ? { members } : {}),
    ...(attributes !== undefined ? { attributes } : {}),
    ...(unsupportedAttributes !== undefined ? { unsupportedAttributes } : {}),
    ...(typeParameters !== undefined ? { typeParameters } : {}),
    ...(implementedContracts !== undefined ? { implementedContracts } : {}),
    ...(unsupportedImplementedContracts !== undefined ? { unsupportedImplementedContracts } : {}),
    ...(unsupportedMembers !== undefined ? { unsupportedMembers } : {}),
    ...(conversionOperators !== undefined ? { conversionOperators } : {}),
    ...(candidateDotnet.csharpType === undefined && existingDotnet.csharpType !== undefined ? { csharpType: existingDotnet.csharpType } : {}),
    ...(candidateDotnet.csharpBaseType === undefined && existingDotnet.csharpBaseType !== undefined ? { csharpBaseType: existingDotnet.csharpBaseType } : {}),
    ...(candidateDotnet.csharpRender === undefined && existingDotnet.csharpRender !== undefined ? { csharpRender: existingDotnet.csharpRender } : {}),
    ...(candidateDotnet.csharpAbstract === undefined && existingDotnet.csharpAbstract !== undefined ? { csharpAbstract: existingDotnet.csharpAbstract } : {}),
    ...(candidateDotnet.csharpUnmanagedTypeParameterIndexes === undefined && existingDotnet.csharpUnmanagedTypeParameterIndexes !== undefined
      ? { csharpUnmanagedTypeParameterIndexes: existingDotnet.csharpUnmanagedTypeParameterIndexes }
      : {}),
  };
}

function mergeByKey<T extends object>(
  existing: readonly T[] | undefined,
  candidate: readonly T[] | undefined,
  keyOf: (value: T) => string,
): readonly T[] | undefined {
  if ((existing === undefined || existing.length === 0) && (candidate === undefined || candidate.length === 0)) {
    return undefined;
  }
  const merged = new Map<string, T>();
  for (const value of existing ?? []) {
    merged.set(keyOf(value), value);
  }
  for (const value of candidate ?? []) {
    const previous = merged.get(keyOf(value));
    merged.set(keyOf(value), previous === undefined ? value : { ...previous, ...value });
  }
  return [...merged.values()];
}

function mergeByStableShape<T extends object>(
  existing: readonly T[] | undefined,
  candidate: readonly T[] | undefined,
): readonly T[] | undefined {
  if ((existing === undefined || existing.length === 0) && (candidate === undefined || candidate.length === 0)) {
    return undefined;
  }
  const merged = new Map<string, T>();
  for (const value of existing ?? []) {
    merged.set(JSON.stringify(value), value);
  }
  for (const value of candidate ?? []) {
    merged.set(JSON.stringify(value), value);
  }
  return [...merged.values()];
}
