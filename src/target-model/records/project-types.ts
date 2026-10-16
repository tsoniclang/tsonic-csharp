import type { CsharpTargetMember, TargetTypeRef } from "../types/model.js";
import type { SourceClassConstructorSignature } from "@tsonic/target-api/source";
import type { Node, SourceFile } from "@tsonic/tsts";

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
  readonly typeProjections: readonly import("../types/projections.js").CsharpProjectedType[];
  readonly outerTypeProjections: readonly import("../types/projections.js").CsharpProjectedType[];
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
