import type { Node } from "@tsonic/tsts";
import type { TargetSelection } from "@tsonic/target-api";
import type {
  SourceApplicationFacts,
  SourceDescriptorView,
  SourceMemberOrigin,
  SourcePresence,
  SourceTypeEvidence,
  SourceTypeParameter,
} from "@tsonic/target-api/source";
import type { TargetTypeRef, CsharpTypeParameterConstraint } from "../../../target-model/types/native-type-data.js";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact } from "../../../target-model/types/model.js";
import type {
  CsharpRepresentationOutcome,
  CsharpDeclaredRepresentation,
  CsharpRepresentedType,
  CsharpRepresentedSignature,
  CsharpSourceRoleImplementation,
} from "../../../target-model/types/representation.js";
import type { CsharpNativeStorageCategory, CsharpNativeStorageDefinition, CsharpNativeStorageKey } from "../../../target-model/types/native-storage.js";
import type { CsharpProviderRelationResolver } from "../../../providers/model/relation-resolver.js";
import type { CsharpProviderNativeDeclarationResolution } from "../../../target-model/metadata/provider-metadata.js";
import type { CsharpNativeTypeIdentity } from "../../../target-model/types/equality.js";

export interface CsharpSourceMemberDeclaration {
  readonly declarations: readonly Node[];
  readonly kind: "property" | "method";
  readonly bound: boolean;
  readonly accessor?: CsharpObjectShapeMemberFact["accessor"];
}

export interface CsharpRepresentationHost {
  readonly typeIdentity: CsharpNativeTypeIdentity;
  readonly source: SourceDescriptorView;
  readonly applications: SourceApplicationFacts;
  readonly target: TargetSelection;
  readonly providers: Pick<CsharpProviderRelationResolver, "findTargetBindingByMetadataName">;
  acquireNativeDeclaration(identity: string): CsharpProviderNativeDeclarationResolution;
  identity(node: Node): { readonly identity: string; readonly name: string | undefined };
  nativeConstraints(
    parameter: SourceTypeParameter,
    bound: CsharpRepresentedType | undefined,
    defaultType: CsharpRepresentedType | undefined,
    recursiveParameter: Extract<TargetTypeRef, { readonly kind: "type-parameter" }>,
    site: Node,
  ): CsharpRepresentationOutcome<readonly CsharpTypeParameterConstraint[]>;
  declaredType(
    evidence: SourceTypeEvidence,
    arguments_: readonly CsharpRepresentedType[],
    site: Node,
  ): CsharpRepresentationOutcome<SourcePresence<CsharpDeclaredRepresentation>>;
  indexType(key: TargetTypeRef, value: TargetTypeRef, readonly: boolean, site: Node): CsharpRepresentationOutcome<TargetTypeRef>;
  callableType(
    signatures: readonly CsharpRepresentedSignature[],
    site: Node,
    storage: "value" | "contract",
  ): CsharpRepresentationOutcome<TargetTypeRef>;
  memberDeclaration(origin: SourceMemberOrigin, site: Node): CsharpRepresentationOutcome<CsharpSourceMemberDeclaration>;
  shapeKind(original: Node): "contract" | "storage";
  retainShape(shape: CsharpObjectShapeFact, site: Node): CsharpRepresentationOutcome<CsharpObjectShapeFact>;
  retainRoleWitness(implementation: CsharpSourceRoleImplementation, site: Node): CsharpRepresentationOutcome<TargetTypeRef>;
  retainNativeStorage(definition: CsharpNativeStorageDefinition, site: Node): CsharpRepresentationOutcome<CsharpNativeStorageDefinition>;
  retainNativeStorageCategory(definition: CsharpNativeStorageCategory, site: Node): CsharpRepresentationOutcome<TargetTypeRef>;
  retainNativeStorageKey(definition: CsharpNativeStorageKey, site: Node): CsharpRepresentationOutcome<TargetTypeRef>;
}
