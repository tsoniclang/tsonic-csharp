import type { CsharpObjectShapeFact, CsharpObjectShapeCapability, CsharpObjectShapeProjection } from "../../../../target-model/types/index.js";
import type { CsharpObjectShapeArtifact, CsharpObjectShapeDemand } from "../../../../target-model/records/object-shape-demand.js";
import type { TargetArtifactContractGraph, TargetArtifactDependency, TargetArtifactReconstruction } from "@tsonic/target-api/artifacts";
import type { CsharpArtifactSnapshot, CsharpArtifactFacet } from "../contracts.js";
import type { CsharpGeneratedHelper } from "../generated-helpers.js";

export type { CsharpObjectShapeArtifact } from "../../../../target-model/records/object-shape-demand.js";

export type CsharpArtifactRequestResult =
  | { readonly kind: "accepted" }
  | { readonly kind: "rejected"; readonly reason: string };

export interface CsharpArtifactGraph {
  readonly revision: number;
  readonly contractGraph: TargetArtifactContractGraph<CsharpArtifactFacet, CsharpArtifactSnapshot>;
  captureDependencies<Value>(owner: string, dependencies: readonly TargetArtifactDependency<CsharpArtifactFacet>[], build: () => Value): {
    readonly value: Value;
    readonly dependencies: readonly TargetArtifactDependency<CsharpArtifactFacet>[];
    readonly stable: boolean;
  };
  objectShapeHasCapability(fact: CsharpObjectShapeFact, capability: CsharpObjectShapeCapability): boolean;
  objectShape(fact: CsharpObjectShapeFact): CsharpObjectShapeArtifact;
  objectShapeProjections(fact: CsharpObjectShapeFact): readonly CsharpObjectShapeProjection[];
  objectShapeMethodUsesReceiver(fact: CsharpObjectShapeFact, member: CsharpObjectShapeFact["members"][number]): boolean;
  objectShapeArtifacts(): readonly CsharpObjectShapeArtifact[];
  requireGeneratedHelper(helper: CsharpGeneratedHelper): CsharpArtifactRequestResult;
  generatedHelpers(): readonly CsharpGeneratedHelper[];
  reconstructArtifact(owner: string): TargetArtifactReconstruction<CsharpArtifactFacet, CsharpArtifactSnapshot>;
  verifyContractClosure(): CsharpArtifactRequestResult;
}

export interface CsharpArtifactDependencyRead {
  readonly dependency: TargetArtifactDependency<CsharpArtifactFacet>;
  readonly revision: number;
}

export interface CsharpArtifactGraphHost {
  readonly objectShapeArtifacts: CsharpObjectShapeDemand;
}
