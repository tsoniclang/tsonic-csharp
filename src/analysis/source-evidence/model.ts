import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { TsonicClosedArrayStorage } from "@tsonic/source-core/facts";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/program/source-evidence.js";
import type { CsharpTargetNamedTypeRef, TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpProjectTypeDefinition, CsharpProjectTypeIssue } from "../../target-model/records/types/project-types.js";
import type { CsharpNodeQuerySource, CsharpTypeQuerySource } from "./types/resolution/root-sources.js";
import type { CsharpNodeTypeResolution } from "../../policy/model/type-resolution.js";
import type { CsharpNativeConstructionPublicationSource } from "../objects/native-construction-publication.js";

type CurrentProjectDeclaration<Definition extends CsharpProjectTypeDefinition> = Definition extends unknown
  ? Omit<Definition, "typeParameterBindings" | "typeProjections" | "outerTypeProjections"> & {
    readonly parameterBindings: Definition["typeParameterBindings"];
  } : never;

export type CsharpCurrentProjectDeclaration = CurrentProjectDeclaration<CsharpProjectTypeDefinition>;

export interface CsharpCurrentProjectDeclarations {
  readonly declarations: readonly CsharpCurrentProjectDeclaration[];
  readonly issues: readonly CsharpProjectTypeIssue[];
  declarationForId(id: string): CsharpCurrentProjectDeclaration | undefined;
  declarationForNode(node: Node | undefined): CsharpCurrentProjectDeclaration | undefined;
  declarationContaining(node: Node | undefined): CsharpCurrentProjectDeclaration | undefined;
  declarationForTarget(type: TargetTypeRef | undefined): CsharpCurrentProjectDeclaration | undefined;
  declaredTypeForDeclaration(node: Node | undefined, arguments_: readonly TargetTypeRef[]): CsharpTargetNamedTypeRef | undefined;
}

export interface CsharpCurrentNativeNodeInput {
  readonly source: CsharpNodeQuerySource;
  readonly constructionSource: CsharpNativeConstructionPublicationSource | undefined;
  readonly resolution: CsharpNodeTypeResolution | undefined;
  readonly storageType: TargetTypeRef | undefined;
  readonly readStorageType: TargetTypeRef | undefined;
}

export interface CsharpCurrentNativeTypeInput {
  readonly source: CsharpTypeQuerySource;
  readonly type: TargetTypeRef | undefined;
}

export interface CsharpSourceEvidenceResult {
  readonly index: CsharpSourceEvidenceIndex;
  readonly currentNodeInputs: readonly CsharpCurrentNativeNodeInput[];
  readonly currentTypeInputs: readonly CsharpCurrentNativeTypeInput[];
  readonly nativeExpressionIssues: readonly (TargetDiagnostic & {
    readonly sourceNode: Node;
    readonly requiredBy: readonly Node[];
  })[];
  inspectClosedArrayStorage(node: Node): TsonicClosedArrayStorage;
  eraseCompileTimeDeclaration(declaration: Node): void;
  sealCompileTimeDeclarations(): void;
}

export interface CsharpSourceEvidenceAnalysis extends CsharpSourceEvidenceIndex {
  inspectClosedArrayStorage(node: Node): TsonicClosedArrayStorage;
}
