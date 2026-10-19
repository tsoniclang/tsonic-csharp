import type {
  ExtensionDiagnostic,
  ProviderVirtualDeclarationFact,
} from "@tsonic/tsts";
import type {
  TargetBindingFact,
} from "../../target-model/types/model.js";
import type { CsharpProviderTargetRelation } from "../../target-model/identities/provider-relations.js";
import type { CsharpProviderBindingLookupPurpose, CsharpProviderBindingResolution, CsharpProviderNativeBindingResolution } from "../../target-model/metadata/provider-metadata.js";
import type { CsharpRuntimeProjectInstance, CsharpRuntimeSourceProject } from "../../target-model/project/runtime.js";
import type { CsharpProjectConfiguration } from "../../target-model/configuration/model.js";
import type { CsharpProjectProperty } from "../../target-model/project/model.js";

export interface CsharpProviderRuntimePreparation {
  readonly sources: readonly CsharpRuntimeSourceProject[];
  readonly projects: readonly CsharpRuntimeProjectInstance[];
  readonly project: CsharpProjectConfiguration;
  readonly properties: readonly CsharpProjectProperty[];
  readonly cacheRoot: string;
}

export class CsharpProviderAcquisitionRejection extends Error {
  constructor(readonly diagnostic: ExtensionDiagnostic) {
    super(diagnostic.message);
    this.name = "CsharpProviderAcquisitionRejection";
  }
}

export function assertCsharpProviderLookupPurpose(
  purpose: CsharpProviderBindingLookupPurpose,
): void {
  if (purpose !== "ordinary" && purpose !== "inheritance") {
    throw new TypeError("C# provider lookup requires an explicit ordinary or inheritance purpose.");
  }
}

export function csharpProviderBindingFromResolution(
  resolution: CsharpProviderBindingResolution,
): TargetBindingFact | undefined {
  switch (resolution.kind) {
    case "resolved": return resolution.binding;
    case "missing": return undefined;
    case "rejected": throw new CsharpProviderAcquisitionRejection(resolution.diagnostic);
    default: throw new TypeError("C# provider lookup requires the current resolved/missing/rejected result.");
  }
}

export type CsharpProviderRelationResolution =
  | {
      readonly kind: "resolved";
      readonly relations: readonly CsharpProviderTargetRelation[];
    }
  | {
      readonly kind: "missing";
      readonly reason: string;
    }
  | {
      readonly kind: "rejected";
      readonly diagnostic: ExtensionDiagnostic;
    };

export interface CsharpProviderRelationResolver {
  validateReferences(): readonly ExtensionDiagnostic[];
  prepareRuntimeSources(preparation: CsharpProviderRuntimePreparation): void;
  resolveType(
    declaration: ProviderVirtualDeclarationFact | undefined,
  ): CsharpProviderRelationResolution;
  resolveValue(
    declaration: ProviderVirtualDeclarationFact | undefined,
  ): CsharpProviderRelationResolution;
  resolveMember(
    declaration: ProviderVirtualDeclarationFact | undefined,
  ): CsharpProviderRelationResolution;
  resolveSignature(
    declaration: ProviderVirtualDeclarationFact | undefined,
  ): CsharpProviderRelationResolution;
  findTargetBindingByTargetId(
    targetId: string,
    purpose: "inheritance",
  ): CsharpProviderNativeBindingResolution;
  findTargetBindingByTargetId(
    targetId: string,
    purpose: CsharpProviderBindingLookupPurpose,
  ): CsharpProviderBindingResolution;
  findTargetBindingByMetadataName(
    metadataName: string,
    purpose: "inheritance",
  ): CsharpProviderNativeBindingResolution;
  findTargetBindingByMetadataName(
    metadataName: string,
    purpose: CsharpProviderBindingLookupPurpose,
  ): CsharpProviderBindingResolution;
}
