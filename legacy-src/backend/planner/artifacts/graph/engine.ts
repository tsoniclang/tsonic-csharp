import { createTargetArtifactContractGraph } from "@tsonic/target-api/artifacts";
import type { TargetArtifactContractGraph } from "@tsonic/target-api/artifacts";
import type { CsharpArtifactFacet, CsharpArtifactSnapshot } from "../contracts.js";
import { csharpObjectShapeContractCandidate } from "../contracts.js";
import type { CsharpArtifactGraph, CsharpArtifactGraphHost, CsharpArtifactDependencyRead } from "./model.js";
import type { CsharpObjectShapeFact } from "../../../../target-model/types/model.js";
import { csharpObjectShapeMemberContractKey } from "../../../../target-model/types/object-shape-identity.js";
import { objectShapeArtifactKey } from "../../../../target-model/records/object-shape-demand.js";
import { createCsharpGeneratedHelperRegistry } from "../generated-helpers.js";
import { captureDependencies, dependOn } from "./dependencies.js";
import { requireGeneratedHelper } from "./generated-helpers.js";
import { failCsharpPlannerInvariant } from "../../../invariants.js";
import { reconstructArtifact, verifyContractClosure } from "./reconstruction.js";

export interface CsharpArtifactGraphScope {
  readonly host: CsharpArtifactGraphHost;
  readonly contracts: TargetArtifactContractGraph<CsharpArtifactFacet, CsharpArtifactSnapshot>;
  readonly helpers: ReturnType<typeof createCsharpGeneratedHelperRegistry>;
  readonly dependencyCapture: { active: Map<string, CsharpArtifactDependencyRead> | undefined };
  readonly dependOn: (owner: string, facet: CsharpArtifactFacet) => void;
}

export function createCsharpArtifactGraph(host: CsharpArtifactGraphHost): CsharpArtifactGraph {
  const contracts = createTargetArtifactContractGraph<CsharpArtifactFacet, CsharpArtifactSnapshot>();
  const seeded = contracts.commitBatch(host.objectShapeArtifacts.artifacts.map(artifact => csharpObjectShapeContractCandidate(
    artifact.key, artifact.fact, artifact.materialization, artifact.capabilities,
    artifact.projections, artifact.receiverBoundMethodKeys, artifact.dependencies, artifact.typeParameterNames,
  )));
  if (seeded.kind === "rejected") {
    failCsharpPlannerInvariant(`Sealed object-shape artifacts have inconsistent contracts: ${seeded.reason}`);
  }
  const helpers = createCsharpGeneratedHelperRegistry(contracts);
  const scope: CsharpArtifactGraphScope = Object.freeze({
    host, contracts, helpers, dependencyCapture: { active: undefined },
    dependOn: (owner: string, facet: CsharpArtifactFacet) => dependOn(scope, owner, facet),
  });
  const read = (fact: CsharpObjectShapeFact, facet: CsharpArtifactFacet) => {
    const key = objectShapeArtifactKey(fact);
    dependOn(scope, key, facet);
    return host.objectShapeArtifacts.get(key) ?? failCsharpPlannerInvariant(
      "An admitted native shape requires its sealed artifact record.");
  };
  return Object.freeze({
    get revision() { return contracts.revision; },
    contractGraph: contracts,
    objectShape: fact => {
      dependOn(scope, objectShapeArtifactKey(fact), "object-shape-materialization");
      return read(fact, "object-shape-type-surface");
    },
    captureDependencies: <Value>(owner: string,
      dependencies: readonly import("@tsonic/target-api/artifacts").TargetArtifactDependency<CsharpArtifactFacet>[], build: () => Value) =>
      captureDependencies(scope, owner, dependencies, build),
    objectShapeHasCapability: (fact, capability) => read(fact, "object-shape-behavior").capabilities.includes(capability),
    objectShapeProjections: fact => read(fact, "object-shape-behavior").projections,
    objectShapeMethodUsesReceiver: (fact, member) =>
      read(fact, "object-shape-type-surface").receiverBoundMethodKeys.includes(csharpObjectShapeMemberContractKey(member)),
    objectShapeArtifacts: () => host.objectShapeArtifacts.artifacts,
    requireGeneratedHelper: helper => requireGeneratedHelper(scope, helper),
    generatedHelpers: helpers.required,
    reconstructArtifact: owner => reconstructArtifact(scope, owner),
    verifyContractClosure: () => verifyContractClosure(scope),
  } satisfies CsharpArtifactGraph);
}
