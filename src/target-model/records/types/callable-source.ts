import type { Node, SourceFile, Type } from "@tsonic/tsts";
import type { SourceCallableTypeEvidence, SourceFileSemantics } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../types/model.js";

export interface CsharpConstraintTypeDependency {
  readonly node: Node;
  readonly sourceFile: SourceFile;
}

export type CsharpNumericConstraintSource =
  | { readonly kind: "unavailable" }
  | { readonly kind: "members"; readonly members: readonly CsharpNumericConstraintSource[] }
  | { readonly kind: "type"; readonly dependency: CsharpConstraintTypeDependency };

export type CsharpConstraintSource =
  | { readonly kind: "unsupported"; readonly reason: string }
  | { readonly kind: "intersection"; readonly parts: readonly CsharpConstraintSource[] }
  | { readonly kind: "type"; readonly objectKeyword: boolean; readonly numeric: CsharpNumericConstraintSource;
      readonly dependency: CsharpConstraintTypeDependency };

export interface CsharpTypeParameterConstraintSource {
  readonly declaration: Node;
  readonly parameter: Extract<TargetTypeRef, { readonly kind: "type-parameter" }>;
  readonly sourceFile: SourceFile;
  readonly constraint: CsharpConstraintSource;
  readonly dependencies: readonly CsharpConstraintTypeDependency[];
}

export interface CsharpCallableDeclarationEvidence {
  readonly declaration: Node | undefined;
  readonly sourceFile: SourceFile;
  readonly typeParameters: readonly {
    readonly declaration: Node;
    readonly identity: string;
    readonly name: string;
    readonly constraint: CsharpTypeParameterConstraintSource;
  }[];
}

export interface CsharpCallableSignatureParameterSource {
  readonly index: number;
  readonly selected: SourceCallableTypeEvidence["parameters"][number];
  readonly parameter: SourceCallableTypeEvidence["parameters"][number];
  readonly tupleElements: ReturnType<SourceFileSemantics["types"]["tupleElementInfos"]> | undefined;
}

export interface CsharpCallableSignatureSource {
  readonly callable: SourceCallableTypeEvidence;
  readonly queries: SourceFileSemantics;
  readonly parameters: readonly CsharpCallableSignatureParameterSource[];
  readonly declaration: CsharpCallableDeclarationEvidence | undefined;
}

export type CsharpCallableTypeSource = {
  readonly type: Type;
  readonly queries: SourceFileSemantics;
} & (
  | { readonly kind: "not-callable" }
  | { readonly kind: "callable"; readonly signature: CsharpCallableSignatureSource }
);
