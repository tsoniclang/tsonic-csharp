import type { CsharpObjectShapeFact, TargetTypeRef } from "../types/model.js";
import type { CsharpTypeParameterConstraint } from "../types/generic-constraints.js";
import type { CsharpObjectShapeArtifact } from "./object-shape-demand.js";
import type { CsharpObjectShapeNameCandidate } from "./object-shape-names.js";

export interface CsharpObjectShapeParameter {
  readonly parameter: Extract<TargetTypeRef, { readonly kind: "type-parameter" }>;
  readonly name: string;
  readonly constraints: readonly CsharpTypeParameterConstraint[];
  readonly variance: "out" | undefined;
}

export interface CsharpObjectShapeEmissionRecords {
  readonly objectShapeNames: { readonly get: () => readonly CsharpObjectShapeNameCandidate[] };
  readonly objectShapeEmission: { readonly get: (fact: CsharpObjectShapeFact) => CsharpObjectShapeEmission | undefined };
  readonly objectShapeDeclarations: { readonly get: () => readonly CsharpObjectShapeDeclarationEmission[] };
  readonly objectShapeParameters: { readonly get: (fact: CsharpObjectShapeFact) => readonly CsharpObjectShapeParameter[] | undefined };
  readonly enumerableKeys: { readonly get: (fact: CsharpObjectShapeFact) => readonly string[] | undefined };
}

export interface CsharpObjectShapeDeclarationEmission {
  readonly artifact: CsharpObjectShapeArtifact;
  readonly name: string;
  readonly representation: "class" | "struct" | "interface";
  readonly identity: string | undefined;
  readonly inheritedEnumerableKeys: boolean;
}

export type CsharpObjectShapeEmission =
  | { readonly kind: "runtime" }
  | { readonly kind: "source"; readonly artifact: CsharpObjectShapeArtifact }
  | { readonly kind: "synthetic"; readonly declaration: CsharpObjectShapeDeclarationEmission };
