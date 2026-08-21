import type {
  CsharpObjectShapeFact,
  CsharpObjectShapeCapability,
  CsharpObjectShapeProjection,
  CsharpObjectShapeProjectionKind,
  TargetTypeRef,
} from "../../../../target-model/types/index.js";
import type { CsharpArtifactRequestResult, CsharpObjectShapeProjectionRequestResult, CsharpObjectShapeArtifact, CsharpArtifactGraph, CsharpArtifactGraphHost, MutableObjectShapeArtifact, JsonClosureState, PreparedObjectShapeBatch } from "./model.js";
import type { CsharpArtifactSnapshot, CsharpArtifactFacet } from "../contracts.js";
import type { CsharpGeneratedHelper } from "../generated-helpers.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type {
  TargetArtifactContractGraph,
  TargetArtifactDependency,
  TargetArtifactReconstruction,
} from "@tsonic/target-api/artifacts";
import { createCsharpGeneratedHelperRegistry } from "../generated-helpers.js";
import { createTargetArtifactContractGraph } from "@tsonic/target-api/artifacts";

import {
  captureDependencies as captureDependenciesImplementation,
  dependOn as dependOnImplementation,
} from "./dependencies.js";
import {
  registerObjectShape as registerObjectShapeImplementation,
  requireObjectShapeCapability as requireObjectShapeCapabilityImplementation,
  objectShapeHasCapability as objectShapeHasCapabilityImplementation,
  requireObjectShapeProjection as requireObjectShapeProjectionImplementation,
  objectShapeProjections as objectShapeProjectionsImplementation,
  requireObjectShapeMethodReceiver as requireObjectShapeMethodReceiverImplementation,
  objectShapeMethodUsesReceiver as objectShapeMethodUsesReceiverImplementation,
  objectShapeArtifacts as objectShapeArtifactsImplementation,
  connect as connectImplementation,
} from "./object-shapes/requests.js";
import {
  collectShapeDependencies as collectShapeDependenciesImplementation,
  prepareObjectShapeBatch as prepareObjectShapeBatchImplementation,
  addObjectShapesToBatch as addObjectShapesToBatchImplementation,
  validateObjectShapeBatch as validateObjectShapeBatchImplementation,
  commitObjectShapeBatch as commitObjectShapeBatchImplementation,
} from "./object-shapes/batches.js";
import {
  collectJsonClosure as collectJsonClosureImplementation,
  collectCapabilityClosure as collectCapabilityClosureImplementation,
  addShapeCapabilities as addShapeCapabilitiesImplementation,
  validateProjectionShapes as validateProjectionShapesImplementation,
  addShapeProjection as addShapeProjectionImplementation,
  visibleObjectShapes as visibleObjectShapesImplementation,
  collectJsonType as collectJsonTypeImplementation,
  collectJsonShape as collectJsonShapeImplementation,
  inheritedObjectShapeCapabilities as inheritedObjectShapeCapabilitiesImplementation,
} from "./object-shapes/closure.js";
import {
  requireGeneratedHelper as requireGeneratedHelperImplementation,
} from "./generated-helpers.js";
import {
  reconstructArtifact as reconstructArtifactImplementation,
  verifyContractClosure as verifyContractClosureImplementation,
} from "./reconstruction.js";

type DropScope<Arguments extends readonly unknown[]> =
  Arguments extends readonly [unknown, ...infer Rest] ? Rest : never;

export interface CsharpArtifactGraphScope {
  readonly host: CsharpArtifactGraphHost;
  readonly records: Map<string, MutableObjectShapeArtifact>;
  readonly contracts: TargetArtifactContractGraph<CsharpArtifactFacet, CsharpArtifactSnapshot>;
  readonly helpers: ReturnType<typeof createCsharpGeneratedHelperRegistry>;
  readonly dependencyCapture: {
    active: Map<string, TargetArtifactDependency<CsharpArtifactFacet>> | undefined;
  };
  captureDependencies<Value>(
  owner: string,
  build: () => Value,
): {
  readonly value: Value;
  readonly dependencies: readonly TargetArtifactDependency<CsharpArtifactFacet>[];
};
  dependOn(
  owner: string,
  facet: CsharpArtifactFacet,
): void;
  registerObjectShape(
  fact: CsharpObjectShapeFact,
  requestedMaterialization: "source" | "synthetic",
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
  requireObjectShapeProjection(
  node: Node | undefined,
  type: TargetTypeRef,
  sourceFile: SourceFile,
  projectionKind: CsharpObjectShapeProjectionKind,
  resultType: TargetTypeRef,
  rootKind: "value" | "object-shape",
): CsharpObjectShapeProjectionRequestResult;
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
  objectShapeArtifacts(): readonly CsharpObjectShapeArtifact[];
  connect(ownerKey: string, dependencyKey: string): void;
  collectShapeDependencies(
  root: CsharpObjectShapeFact,
):
  | {
      readonly kind: "accepted";
      readonly shapes: ReadonlyMap<string, CsharpObjectShapeFact>;
      readonly dependencies: ReadonlyMap<string, ReadonlySet<string>>;
    }
  | { readonly kind: "rejected"; readonly reason: string };
  prepareObjectShapeBatch(
  roots: readonly {
    readonly fact: CsharpObjectShapeFact;
    readonly materialization: "source" | "synthetic";
  }[],
):
  | { readonly kind: "accepted"; readonly batch: PreparedObjectShapeBatch }
  | { readonly kind: "rejected"; readonly reason: string };
  addObjectShapesToBatch(
  batch: PreparedObjectShapeBatch,
  roots: readonly {
    readonly fact: CsharpObjectShapeFact;
    readonly materialization: "source" | "synthetic";
  }[],
): CsharpArtifactRequestResult;
  validateObjectShapeBatch(
  batch: PreparedObjectShapeBatch,
  capabilitiesByShape: ReadonlyMap<
    string,
    ReadonlySet<CsharpObjectShapeCapability>
  >,
  projectionsByShape: ReadonlyMap<
    string,
    ReadonlyMap<string, CsharpObjectShapeProjection>
  >,
  receiverBoundMethodsByShape: ReadonlyMap<string, ReadonlySet<string>>,
): CsharpArtifactRequestResult;
  commitObjectShapeBatch(
  batch: PreparedObjectShapeBatch,
  capabilitiesByShape: ReadonlyMap<
    string,
    ReadonlySet<CsharpObjectShapeCapability>
  >,
  projectionsByShape: ReadonlyMap<
    string,
    ReadonlyMap<string, CsharpObjectShapeProjection>
  >,
  receiverBoundMethodsByShape: ReadonlyMap<string, ReadonlySet<string>>,
): CsharpArtifactRequestResult;
  collectJsonClosure(
  type: TargetTypeRef,
  preferredShape: CsharpObjectShapeFact | undefined,
  pendingShapes?: ReadonlyMap<string, CsharpObjectShapeFact>,
):
  | {
      readonly kind: "accepted";
      readonly shapes: ReadonlyMap<string, CsharpObjectShapeFact>;
    }
  | { readonly kind: "rejected"; readonly reason: string };
  collectCapabilityClosure(
  capability: CsharpObjectShapeCapability,
  type: TargetTypeRef,
  preferredShape: CsharpObjectShapeFact | undefined,
  pendingShapes?: ReadonlyMap<string, CsharpObjectShapeFact>,
):
  | {
      readonly kind: "accepted";
      readonly shapes: ReadonlyMap<string, CsharpObjectShapeFact>;
    }
  | { readonly kind: "rejected"; readonly reason: string };
  addShapeCapabilities(
  target: Map<string, Set<CsharpObjectShapeCapability>>,
  shapes: ReadonlyMap<string, CsharpObjectShapeFact>,
  capability: CsharpObjectShapeCapability,
): void;
  validateProjectionShapes(
  shapes: ReadonlyMap<string, CsharpObjectShapeFact>,
  projection: CsharpObjectShapeProjection,
): string | undefined;
  addShapeProjection(
  target: Map<string, Map<string, CsharpObjectShapeProjection>>,
  shapes: ReadonlyMap<string, CsharpObjectShapeFact>,
  projection: CsharpObjectShapeProjection,
): void;
  visibleObjectShapes(
  pendingShapes: ReadonlyMap<string, CsharpObjectShapeFact>,
): readonly CsharpObjectShapeFact[];
  collectJsonType(
  type: TargetTypeRef,
  preferredShape: CsharpObjectShapeFact | undefined,
  state: JsonClosureState,
): string | undefined;
  collectJsonShape(
  shape: CsharpObjectShapeFact,
  state: JsonClosureState,
): string | undefined;
  inheritedObjectShapeCapabilities(
  fact: CsharpObjectShapeFact,
): readonly CsharpObjectShapeCapability[];
  requireGeneratedHelper(
  helper: CsharpGeneratedHelper,
): CsharpArtifactRequestResult;
  reconstructArtifact(
  owner: string,
): TargetArtifactReconstruction<CsharpArtifactFacet, CsharpArtifactSnapshot>;
  verifyContractClosure(): CsharpArtifactRequestResult;
}

export function createCsharpArtifactGraph(
  host: CsharpArtifactGraphHost,
): CsharpArtifactGraph {
  const records = new Map<string, MutableObjectShapeArtifact>();
  const contracts = createTargetArtifactContractGraph<
    CsharpArtifactFacet,
    CsharpArtifactSnapshot
  >();
  const helpers = createCsharpGeneratedHelperRegistry(contracts);
  let scope!: CsharpArtifactGraphScope;
  const methods = {
    captureDependencies: <Value>(owner: string, build: () => Value) =>
      captureDependenciesImplementation(scope, owner, build),
    dependOn: (...args: DropScope<Parameters<typeof dependOnImplementation>>) =>
      dependOnImplementation(scope, ...args),
    registerObjectShape: (...args: DropScope<Parameters<typeof registerObjectShapeImplementation>>) =>
      registerObjectShapeImplementation(scope, ...args),
    requireObjectShapeCapability: (...args: DropScope<Parameters<typeof requireObjectShapeCapabilityImplementation>>) =>
      requireObjectShapeCapabilityImplementation(scope, ...args),
    objectShapeHasCapability: (...args: DropScope<Parameters<typeof objectShapeHasCapabilityImplementation>>) =>
      objectShapeHasCapabilityImplementation(scope, ...args),
    requireObjectShapeProjection: (...args: DropScope<Parameters<typeof requireObjectShapeProjectionImplementation>>) =>
      requireObjectShapeProjectionImplementation(scope, ...args),
    objectShapeProjections: (...args: DropScope<Parameters<typeof objectShapeProjectionsImplementation>>) =>
      objectShapeProjectionsImplementation(scope, ...args),
    requireObjectShapeMethodReceiver: (...args: DropScope<Parameters<typeof requireObjectShapeMethodReceiverImplementation>>) =>
      requireObjectShapeMethodReceiverImplementation(scope, ...args),
    objectShapeMethodUsesReceiver: (...args: DropScope<Parameters<typeof objectShapeMethodUsesReceiverImplementation>>) =>
      objectShapeMethodUsesReceiverImplementation(scope, ...args),
    objectShapeArtifacts: (...args: DropScope<Parameters<typeof objectShapeArtifactsImplementation>>) =>
      objectShapeArtifactsImplementation(scope, ...args),
    connect: (...args: DropScope<Parameters<typeof connectImplementation>>) =>
      connectImplementation(scope, ...args),
    collectShapeDependencies: (...args: DropScope<Parameters<typeof collectShapeDependenciesImplementation>>) =>
      collectShapeDependenciesImplementation(scope, ...args),
    prepareObjectShapeBatch: (...args: DropScope<Parameters<typeof prepareObjectShapeBatchImplementation>>) =>
      prepareObjectShapeBatchImplementation(scope, ...args),
    addObjectShapesToBatch: (...args: DropScope<Parameters<typeof addObjectShapesToBatchImplementation>>) =>
      addObjectShapesToBatchImplementation(scope, ...args),
    validateObjectShapeBatch: (...args: DropScope<Parameters<typeof validateObjectShapeBatchImplementation>>) =>
      validateObjectShapeBatchImplementation(scope, ...args),
    commitObjectShapeBatch: (...args: DropScope<Parameters<typeof commitObjectShapeBatchImplementation>>) =>
      commitObjectShapeBatchImplementation(scope, ...args),
    collectJsonClosure: (...args: DropScope<Parameters<typeof collectJsonClosureImplementation>>) =>
      collectJsonClosureImplementation(scope, ...args),
    collectCapabilityClosure: (...args: DropScope<Parameters<typeof collectCapabilityClosureImplementation>>) =>
      collectCapabilityClosureImplementation(scope, ...args),
    addShapeCapabilities: (...args: DropScope<Parameters<typeof addShapeCapabilitiesImplementation>>) =>
      addShapeCapabilitiesImplementation(scope, ...args),
    validateProjectionShapes: (...args: DropScope<Parameters<typeof validateProjectionShapesImplementation>>) =>
      validateProjectionShapesImplementation(scope, ...args),
    addShapeProjection: (...args: DropScope<Parameters<typeof addShapeProjectionImplementation>>) =>
      addShapeProjectionImplementation(scope, ...args),
    visibleObjectShapes: (...args: DropScope<Parameters<typeof visibleObjectShapesImplementation>>) =>
      visibleObjectShapesImplementation(scope, ...args),
    collectJsonType: (...args: DropScope<Parameters<typeof collectJsonTypeImplementation>>) =>
      collectJsonTypeImplementation(scope, ...args),
    collectJsonShape: (...args: DropScope<Parameters<typeof collectJsonShapeImplementation>>) =>
      collectJsonShapeImplementation(scope, ...args),
    inheritedObjectShapeCapabilities: (...args: DropScope<Parameters<typeof inheritedObjectShapeCapabilitiesImplementation>>) =>
      inheritedObjectShapeCapabilitiesImplementation(scope, ...args),
    requireGeneratedHelper: (...args: DropScope<Parameters<typeof requireGeneratedHelperImplementation>>) =>
      requireGeneratedHelperImplementation(scope, ...args),
    reconstructArtifact: (...args: DropScope<Parameters<typeof reconstructArtifactImplementation>>) =>
      reconstructArtifactImplementation(scope, ...args),
    verifyContractClosure: (...args: DropScope<Parameters<typeof verifyContractClosureImplementation>>) =>
      verifyContractClosureImplementation(scope, ...args),
  };
  const graph: CsharpArtifactGraph = Object.freeze({
    get revision(): number {
      return contracts.revision;
    },
    contractGraph: contracts,
    captureDependencies: methods.captureDependencies,
    registerObjectShape: methods.registerObjectShape,
    requireObjectShapeCapability: methods.requireObjectShapeCapability,
    requireObjectShapeProjection: methods.requireObjectShapeProjection,
    objectShapeHasCapability: methods.objectShapeHasCapability,
    objectShapeProjections: methods.objectShapeProjections,
    requireObjectShapeMethodReceiver: methods.requireObjectShapeMethodReceiver,
    objectShapeMethodUsesReceiver: methods.objectShapeMethodUsesReceiver,
    objectShapeArtifacts: methods.objectShapeArtifacts,
    requireGeneratedHelper: methods.requireGeneratedHelper,
    reconstructArtifact: methods.reconstructArtifact,
    verifyContractClosure: methods.verifyContractClosure,
    generatedHelpers: helpers.required,
  } satisfies CsharpArtifactGraph);
  scope = Object.freeze({
    host,
    records,
    contracts,
    helpers,
    dependencyCapture: { active: undefined },
    ...methods,
  });
  return graph;
}
