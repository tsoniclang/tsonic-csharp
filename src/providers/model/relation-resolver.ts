import type {
  ExtensionDiagnostic,
  ProviderVirtualDeclarationFact,
} from "@tsonic/tsts";
import type {
  TargetBindingFact,
} from "../../policy/types/model/definitions.js";
import type {
  CsharpProviderTargetRelation,
} from "../relations/index.js";

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
  ): TargetBindingFact | undefined;
  findTargetBindingByMetadataName(
    metadataName: string,
  ): TargetBindingFact | undefined;
}
