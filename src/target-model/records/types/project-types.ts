import { type CsharpTargetMember, type TargetTypeRef, type CsharpTargetNamedTypeRef } from "../../types/model.js";
import { type SourceClassConstructorSignature, type SourceEnumIntegerWidthSelection } from "@tsonic/target-api/source";
import { type Node, type SourceFile, type Signature } from "@tsonic/tsts";

export interface CsharpProjectTypeClassifications {
  readonly issues: readonly CsharpProjectTypeIssue[];
  readonly declarationScopeNames: readonly string[];
  definitionContainingDeclaration(
    declaration: Node | undefined,
  ): CsharpProjectTypeDefinition | undefined;
  heritageForDeclaration(
    declaration: Node,
  ): CsharpProjectTypeHeritage | undefined;
  heritageForTarget(
    type: TargetTypeRef,
  ): CsharpProjectTypeHeritage | undefined;
  implicitConstructorsForDeclaration(
    declaration: Node,
  ): readonly CsharpProjectForwardingConstructor[] | undefined;
}

export interface CsharpProjectTypeIssue {
  readonly node: Node;
  readonly code: string;
  readonly message: string;
}

interface CsharpProjectTypeDefinitionData {
  readonly id: string;
  readonly declaration: Node;
  readonly sourceFile: SourceFile;
  readonly sourceName: string;
  readonly typeParameterBindings: readonly Extract<TargetTypeRef, { readonly kind: "type-parameter" }>[];
  readonly typeProjections: readonly import("../../types/projections.js").CsharpProjectedType[];
  readonly outerTypeProjections: readonly import("../../types/projections.js").CsharpProjectedType[];
  readonly outerTypeParameters: readonly Node[];
  readonly typeParameters: readonly Node[];
  readonly sourceTypeParameterCount: number;
  readonly staticCompanion: boolean;
  readonly abstract: boolean;
  readonly publicParameterlessConstructor: boolean;
  readonly local: boolean;
  readonly scopeName?: string;
  readonly factoryName?: string;
  readonly factoryIdentityName?: string;
}

export type CsharpProjectTypeDefinition = CsharpProjectTypeDefinitionData & (
  | { readonly kind: "class" | "interface" | "struct" }
  | { readonly kind: "enum"; readonly integerWidth: 32 | 64 }
);

export interface CsharpProjectTypeHeritage {
  readonly definition: CsharpProjectTypeDefinition;
  readonly baseType?: TargetTypeRef;
  readonly interfaces: readonly TargetTypeRef[];
}

export interface CsharpProjectForwardingConstructor {
  readonly definition: CsharpProjectTypeDefinition;
  readonly source: SourceClassConstructorSignature;
  readonly targetMember: CsharpTargetMember;
  readonly baseMemberId?: string;
}

export interface CsharpProjectTypeCatalog {
  readonly definitions: readonly CsharpProjectTypeDefinition[];
  readonly issues: readonly CsharpProjectTypeIssue[];
  definitionForId(id: string): CsharpProjectTypeDefinition | undefined;
  definitionForDeclaration(
    declaration: Node | undefined,
  ): CsharpProjectTypeDefinition | undefined;
  definitionContainingDeclaration(
    declaration: Node | undefined,
  ): CsharpProjectTypeDefinition | undefined;
  definitionForTarget(
    type: TargetTypeRef | undefined,
  ): CsharpProjectTypeDefinition | undefined;
  targetTypeForDeclaration(
    declaration: Node | undefined,
    typeArguments: readonly TargetTypeRef[],
  ): CsharpTargetNamedTypeRef | undefined;
}

export interface CsharpProjectTypePolicy {
  readonly catalog: CsharpProjectTypeCatalog;
  readonly issues: readonly CsharpProjectTypeIssue[];
  heritageForDeclaration(
    declaration: Node,
  ): CsharpProjectTypeHeritage | undefined;
  directSupertypes(
    type: TargetTypeRef,
  ): readonly TargetTypeRef[] | undefined;
  instantiateDeclarationType(
    declaration: Node | undefined,
    receiver: TargetTypeRef | undefined,
    declaredType: TargetTypeRef,
  ): CsharpProjectMemberTypeInstantiation;
  instantiateMemberType(
    declaration: Node | undefined,
    receiver: TargetTypeRef | undefined,
    memberType: TargetTypeRef,
  ): CsharpProjectMemberTypeInstantiation;
  implicitConstructorsForDeclaration(
    declaration: Node,
  ): readonly CsharpProjectForwardingConstructor[] | undefined;
  implicitConstructorForSignature(
    declaration: Node,
    signature: import("@tsonic/tsts").Signature,
    parameters: import("@tsonic/target-api/source").ResolvedSourceCallInfo["sourceSelectedSignatureParameters"],
  ): CsharpProjectForwardingConstructor | undefined;
}

export type CsharpProjectMemberTypeInstantiation =
  | { readonly kind: "not-project-member" }
  | { readonly kind: "resolved"; readonly type: TargetTypeRef }
  | { readonly kind: "unresolved"; readonly reason: string };

export type CsharpProjectTypeDefinitionSelection =
  | { readonly kind: "resolved"; readonly definition: CsharpProjectTypeDefinition }
  | { readonly kind: "not-project-type" }
  | { readonly kind: "rejected"; readonly selection: Extract<SourceEnumIntegerWidthSelection, { readonly kind: "rejected" }> };


export interface CsharpProjectConstructorPolicy {
  readonly issues: readonly CsharpProjectTypeIssue[];
  implicitConstructorsForDeclaration(
    declaration: CsharpProjectTypeDefinition["declaration"],
  ): readonly CsharpProjectForwardingConstructor[] | undefined;
  implicitConstructorForSignature(
    declaration: CsharpProjectTypeDefinition["declaration"],
    signature: Signature,
    parameters: import("@tsonic/target-api/source").ResolvedSourceCallInfo["sourceSelectedSignatureParameters"],
  ): CsharpProjectForwardingConstructor | undefined;
}
