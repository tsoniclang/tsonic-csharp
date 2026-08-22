import type {
  CsharpObjectShapeFact,
  CsharpObjectShapeCapability,
  CsharpObjectShapeProjection,
  CsharpObjectShapeProjectionKind,
  TargetTypeRef,
} from "../../../../target-model/types/index.js";
import type {
  CsharpObjectShapeClassifications,
} from "../../../../analysis/object-shapes/index.js";
import type {
  TargetArtifactContractGraph,
  TargetArtifactDependency,
  TargetArtifactReconstruction,
} from "@tsonic/target-api/artifacts";
import type { AstReader, Node, SourceFile } from "@tsonic/tsts";
import type { CsharpArtifactSnapshot, CsharpArtifactFacet } from "../contracts.js";
import type { CsharpGeneratedHelper } from "../generated-helpers.js";

export type CsharpArtifactRequestResult =
  | { readonly kind: "accepted" }
  | { readonly kind: "rejected"; readonly reason: string };

export type CsharpObjectShapeProjectionRequestResult =
  | {
      readonly kind: "accepted";
      readonly projection?: CsharpObjectShapeProjection;
    }
  | { readonly kind: "rejected"; readonly reason: string };

export interface CsharpObjectShapeArtifact {
  readonly key: string;
  readonly fact: CsharpObjectShapeFact;
  readonly materialization: "source" | "synthetic";
  readonly capabilities: readonly CsharpObjectShapeCapability[];
  readonly projections: readonly CsharpObjectShapeProjection[];
  readonly receiverBoundMethodKeys: readonly string[];
  readonly dependencies: readonly string[];
  readonly dependents: readonly string[];
}

export interface CsharpArtifactGraph {
  readonly revision: number;
  readonly contractGraph: TargetArtifactContractGraph<
    CsharpArtifactFacet,
    CsharpArtifactSnapshot
  >;
  captureDependencies<Value>(
    owner: string,
    build: () => Value,
  ): {
    readonly value: Value;
    readonly dependencies: readonly TargetArtifactDependency<CsharpArtifactFacet>[];
  };
  registerObjectShape(
    fact: CsharpObjectShapeFact,
    materialization: "source" | "synthetic",
  ): CsharpArtifactRequestResult;
  requireObjectShapeCapability(
    node: Node | undefined,
    type: TargetTypeRef,
    sourceFile: SourceFile,
    capability: CsharpObjectShapeCapability,
    rootKind: "value" | "object-shape",
  ): CsharpArtifactRequestResult;
  objectShapeHasCapability(
    fact: CsharpObjectShapeFact,
    capability: CsharpObjectShapeCapability,
  ): boolean;
  objectShapeProjections(
    fact: CsharpObjectShapeFact,
  ): readonly CsharpObjectShapeProjection[];
  requireObjectShapeMethodReceiver(
    fact: CsharpObjectShapeFact,
    member: CsharpObjectShapeFact["members"][number],
  ): CsharpArtifactRequestResult;
  objectShapeMethodUsesReceiver(
    fact: CsharpObjectShapeFact,
    member: CsharpObjectShapeFact["members"][number],
  ): boolean;
  requireObjectShapeProjection(
    node: Node | undefined,
    type: TargetTypeRef,
    sourceFile: SourceFile,
    projection: CsharpObjectShapeProjectionKind,
    resultType: TargetTypeRef,
    rootKind: "value" | "object-shape",
  ): CsharpObjectShapeProjectionRequestResult;
  objectShapeArtifacts(): readonly CsharpObjectShapeArtifact[];
  requireGeneratedHelper(
    helper: CsharpGeneratedHelper,
  ): CsharpArtifactRequestResult;
  generatedHelpers(): readonly CsharpGeneratedHelper[];
  reconstructArtifact(
    owner: string,
  ): TargetArtifactReconstruction<CsharpArtifactFacet, CsharpArtifactSnapshot>;
  verifyContractClosure(): CsharpArtifactRequestResult;
}

export interface CsharpArtifactGraphHost {
  readonly ast: AstReader;
  readonly objectShapes: CsharpObjectShapeClassifications;
}

export interface MutableObjectShapeArtifact {
  fact: CsharpObjectShapeFact;
  materialization: "source" | "synthetic";
  readonly capabilities: Set<CsharpObjectShapeCapability>;
  readonly projections: Map<string, CsharpObjectShapeProjection>;
  readonly receiverBoundMethodKeys: Set<string>;
  readonly dependencies: Set<string>;
  readonly dependents: Set<string>;
}

export interface JsonClosureState {
  readonly visiting: Set<string>;
  readonly collected: Map<string, CsharpObjectShapeFact>;
  depth: number;
}

export interface PreparedObjectShapeBatch {
  readonly shapes: Map<string, CsharpObjectShapeFact>;
  readonly dependencies: Map<string, Set<string>>;
  readonly materializations: Map<string, "source" | "synthetic">;
}

export interface StagedObjectShapeRecord {
  readonly fact: CsharpObjectShapeFact;
  readonly materialization: "source" | "synthetic";
  readonly capabilities: ReadonlySet<CsharpObjectShapeCapability>;
  readonly projections: ReadonlyMap<string, CsharpObjectShapeProjection>;
  readonly receiverBoundMethodKeys: ReadonlySet<string>;
  readonly dependencies: ReadonlySet<string>;
}

export const maximumArtifactCount = 131_072;
export const maximumJsonClosureDepth = 256;
