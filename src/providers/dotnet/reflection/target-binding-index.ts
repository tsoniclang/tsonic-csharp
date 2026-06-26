import type {
  TargetBindingFact,
} from "@tsonic/tsts";
import type {
  DotnetModuleModel,
} from "../model.js";
import {
  dotnetExportToTargetBinding,
} from "../model.js";
import type {
  DotnetTargetBindingFact,
} from "../model-target-conversion.js";

export interface DotnetTargetBindingIndex {
  readonly rememberModule: (module: DotnetModuleModel) => void;
  readonly getByTargetId: (targetId: string) => TargetBindingFact | undefined;
  readonly getUniqueByMetadataName: (metadataName: string) => TargetBindingFact | undefined;
}

export function createDotnetTargetBindingIndex(): DotnetTargetBindingIndex {
  const targetBindingsByTargetId = new Map<string, TargetBindingFact>();
  const targetBindingsByMetadataName = new Map<string, TargetBindingFact | "ambiguous">();

  function rememberModule(module: DotnetModuleModel): void {
    for (const declaration of [...module.exports, ...(module.targetOnlyTypes ?? [])]) {
      if (declaration.kind !== "type") {
        continue;
      }
      const binding = dotnetExportToTargetBinding(declaration);
      if (binding === undefined) {
        continue;
      }
      const mergedTargetBinding = rememberTargetBindingByTargetId(binding);
      const existing = targetBindingsByMetadataName.get(declaration.metadataName);
      targetBindingsByMetadataName.set(
        declaration.metadataName,
        existing === undefined || (existing !== "ambiguous" && existing.id === binding.id)
          ? mergeTargetBindingFacts(existing, mergedTargetBinding)
          : "ambiguous",
      );
    }
  }

  function rememberTargetBindingByTargetId(binding: TargetBindingFact): TargetBindingFact {
    const merged = mergeTargetBindingFacts(targetBindingsByTargetId.get(binding.id), binding);
    targetBindingsByTargetId.set(binding.id, merged);
    return merged;
  }

  return {
    rememberModule,
    getByTargetId(targetId: string): TargetBindingFact | undefined {
      return targetBindingsByTargetId.get(targetId);
    },
    getUniqueByMetadataName(metadataName: string): TargetBindingFact | undefined {
      const existing = targetBindingsByMetadataName.get(metadataName);
      return existing === "ambiguous" ? undefined : existing;
    },
  };
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
  const members = mergeByKey(existing.members, candidate.members, (member) => member.id);
  const attributes = mergeByKey(existing.attributes, candidate.attributes, (attribute) => attribute.id);
  const unsupportedAttributes = mergeByKey(
    existing.unsupportedAttributes,
    candidate.unsupportedAttributes,
    (attribute) => attribute.id,
  );
  const typeParameters = mergeByKey(existing.typeParameters, candidate.typeParameters, (parameter) => parameter.name);
  const implementedContracts = mergeByStableShape(existing.implementedContracts, candidate.implementedContracts);
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
    existing.conversionOperators,
    candidate.conversionOperators,
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
