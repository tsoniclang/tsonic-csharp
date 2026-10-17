import type { Node, SourceFile } from "@tsonic/tsts";
import type { CsharpObjectShapeClassifications } from "./model.js";
import type { CsharpProjectTypeClassifications } from "../../target-model/records/project-types.js";
import type { CsharpTypeDefinitions } from "../../target-model/types/source-union-definitions.js";
import type { CsharpObjectShapeArtifact } from "../../target-model/records/object-shape-demand.js";
import type { TargetTypeRef, CsharpObjectShapeProjectionKind } from "../../target-model/types/model.js";
import type { CsharpObjectShapeFact, CsharpObjectShapeCapability, CsharpObjectShapeProjection } from "../../target-model/types/index.js";
import { csharpObjectShapesEqual, csharpObjectShapeMemberContractKey } from "../../target-model/types/index.js";
import { objectShapeArtifactKey, objectShapeMaterialization } from "../../target-model/records/object-shape-demand.js";
import { csharpTargetTypeComponents } from "../../target-model/types/components.js";
import { targetTypeRefKey } from "../../target-model/types/equality.js";
import { isCsharpEmptyObjectTargetType } from "../../target-model/types/carriers/runtime-carriers.js";

export type CsharpArtifactRequestResult = { readonly kind: "accepted" } | { readonly kind: "rejected"; readonly reason: string };
export type CsharpObjectShapeProjectionRequestResult =
  | { readonly kind: "accepted"; readonly projection?: CsharpObjectShapeProjection }
  | { readonly kind: "rejected"; readonly reason: string };
export const accepted: CsharpArtifactRequestResult = Object.freeze({ kind: "accepted" });
export function rejected(reason: string): Extract<CsharpArtifactRequestResult, { readonly kind: "rejected" }> {
  return { kind: "rejected", reason };
}
export const maximumArtifactCount = 131_072;
export const maximumJsonClosureDepth = 256;

export interface CsharpObjectShapeDemandHost {
  readonly objectShapes: CsharpObjectShapeClassifications;
  readonly projectTypes?: Pick<CsharpProjectTypeClassifications, "heritageForTarget">;
  readonly typeDefinitions?: CsharpTypeDefinitions;
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

interface CsharpObjectShapeClosure {
  readonly kind: "accepted";
  readonly shapes: ReadonlyMap<string, CsharpObjectShapeFact>;
}
type CsharpObjectShapeClosureResult = CsharpObjectShapeClosure | { readonly kind: "rejected"; readonly reason: string };

export interface CsharpObjectShapeDemandScope {
  readonly host: CsharpObjectShapeDemandHost;
  readonly records: Map<string, MutableObjectShapeArtifact>;
  readonly projections: Map<Node, CsharpObjectShapeProjection>;
  registerObjectShape(fact: CsharpObjectShapeFact, materialization: "source" | "synthetic"): CsharpArtifactRequestResult;
  requireObjectShapeCapability(node: Node | undefined, type: TargetTypeRef, file: SourceFile,
    capability: CsharpObjectShapeCapability, rootKind: "value" | "object-shape"): CsharpArtifactRequestResult;
  requireObjectShapeProjection(node: Node | undefined, type: TargetTypeRef, file: SourceFile,
    projection: CsharpObjectShapeProjectionKind, resultType: TargetTypeRef, rootKind: "value" | "object-shape",
    assignmentSource?: { readonly node: Node; readonly type: TargetTypeRef }): CsharpObjectShapeProjectionRequestResult;
  requireObjectShapeMethodReceiver(fact: CsharpObjectShapeFact,
    member: CsharpObjectShapeFact["members"][number]): CsharpArtifactRequestResult;
  objectShapeArtifacts(): readonly CsharpObjectShapeArtifact[];
  connect(ownerKey: string, dependencyKey: string): void;
  collectShapeDependencies(root: CsharpObjectShapeFact):
    CsharpObjectShapeClosure & { readonly dependencies: ReadonlyMap<string, ReadonlySet<string>> }
    | { readonly kind: "rejected"; readonly reason: string };
  prepareObjectShapeBatch(roots: readonly { readonly fact: CsharpObjectShapeFact; readonly materialization: "source" | "synthetic" }[]):
    { readonly kind: "accepted"; readonly batch: PreparedObjectShapeBatch } | { readonly kind: "rejected"; readonly reason: string };
  addObjectShapesToBatch(batch: PreparedObjectShapeBatch,
    roots: readonly { readonly fact: CsharpObjectShapeFact; readonly materialization: "source" | "synthetic" }[]): CsharpArtifactRequestResult;
  validateObjectShapeBatch(batch: PreparedObjectShapeBatch, capabilities: ReadonlyMap<string, ReadonlySet<CsharpObjectShapeCapability>>,
    projections: ReadonlyMap<string, ReadonlyMap<string, CsharpObjectShapeProjection>>,
    receivers: ReadonlyMap<string, ReadonlySet<string>>): CsharpArtifactRequestResult;
  commitObjectShapeBatch(batch: PreparedObjectShapeBatch, capabilities: ReadonlyMap<string, ReadonlySet<CsharpObjectShapeCapability>>,
    projections: ReadonlyMap<string, ReadonlyMap<string, CsharpObjectShapeProjection>>,
    receivers: ReadonlyMap<string, ReadonlySet<string>>): CsharpArtifactRequestResult;
  collectJsonClosure(type: TargetTypeRef, preferred: CsharpObjectShapeFact | undefined,
    pending?: ReadonlyMap<string, CsharpObjectShapeFact>): CsharpObjectShapeClosureResult;
  collectCapabilityClosure(capability: CsharpObjectShapeCapability, type: TargetTypeRef, preferred: CsharpObjectShapeFact | undefined,
    pending?: ReadonlyMap<string, CsharpObjectShapeFact>): CsharpObjectShapeClosureResult;
  addShapeCapabilities(target: Map<string, Set<CsharpObjectShapeCapability>>, shapes: ReadonlyMap<string, CsharpObjectShapeFact>,
    capability: CsharpObjectShapeCapability): void;
  validateProjectionShapes(shapes: ReadonlyMap<string, CsharpObjectShapeFact>, projection: CsharpObjectShapeProjection): string | undefined;
  addShapeProjection(target: Map<string, Map<string, CsharpObjectShapeProjection>>, shapes: ReadonlyMap<string, CsharpObjectShapeFact>,
    projection: CsharpObjectShapeProjection): void;
  visibleObjectShapes(pending: ReadonlyMap<string, CsharpObjectShapeFact>): readonly CsharpObjectShapeFact[];
  collectJsonType(type: TargetTypeRef, preferred: CsharpObjectShapeFact | undefined, state: JsonClosureState): string | undefined;
  collectJsonShape(shape: CsharpObjectShapeFact, state: JsonClosureState): string | undefined;
  inheritedObjectShapeCapabilities(fact: CsharpObjectShapeFact): readonly CsharpObjectShapeCapability[];
}

export function collectShapeDependencies(
  { host }: CsharpObjectShapeDemandScope,
  root: CsharpObjectShapeFact,
):
  | {
      readonly kind: "accepted";
      readonly shapes: ReadonlyMap<string, CsharpObjectShapeFact>;
      readonly dependencies: ReadonlyMap<string, ReadonlySet<string>>;
    }
  | { readonly kind: "rejected"; readonly reason: string } {
  const shapes = new Map<string, CsharpObjectShapeFact>();
  const dependencies = new Map<string, Set<string>>();
  const queue: CsharpObjectShapeFact[] = [root];
  while (queue.length > 0) {
    const shape = queue.pop()!;
    const key = objectShapeArtifactKey(shape);
    const existing = shapes.get(key);
    if (existing !== undefined) {
      if (!csharpObjectShapesEqual(existing, shape)) {
        return rejected(
          `C# object-shape dependency '${key}' has conflicting structural definitions.`,
        );
      }
      continue;
    }
    if (shapes.size >= maximumArtifactCount) {
      return rejected(
        `C# object-shape dependency closure exceeds its finite ${maximumArtifactCount}-shape budget.`,
      );
    }
    shapes.set(key, shape);
    const declaration = shape.declarationTemplate;
    if (declaration !== undefined && objectShapeArtifactKey(declaration) !== key) {
      const edges = dependencies.get(key) ?? new Set<string>();
      edges.add(objectShapeArtifactKey(declaration));
      dependencies.set(key, edges);
      queue.push(declaration);
    }
    const targets = [...csharpTargetTypeComponents(shape.targetType, shape)];
    if (shape.declarationTemplate !== undefined) {
      targets.push(...csharpTargetTypeComponents(shape.declarationTemplate.targetType, shape.declarationTemplate));
    }
    const visitedTypes = new Set<string>();
    for (let index = 0; index < targets.length; index++) {
      const target = targets[index]!;
      const typeKey = targetTypeRefKey(target);
      if (visitedTypes.has(typeKey)) continue;
      visitedTypes.add(typeKey);
      if (visitedTypes.size > maximumArtifactCount) return rejected("C# object-shape type dependency budget exceeded.");
      const nested = host.objectShapes.resolveTarget(target);
      if (nested === undefined) {
        targets.push(...csharpTargetTypeComponents(target));
        continue;
      }
      const nestedKey = objectShapeArtifactKey(nested);
      const edges = dependencies.get(key) ?? new Set<string>();
      edges.add(nestedKey);
      dependencies.set(key, edges);
      queue.push(nested);
    }
  }
  return { kind: "accepted", shapes, dependencies };
}

export function prepareObjectShapeBatch(
  { addObjectShapesToBatch }: CsharpObjectShapeDemandScope,
  roots: readonly {
    readonly fact: CsharpObjectShapeFact;
    readonly materialization: "source" | "synthetic";
  }[],
):
  | { readonly kind: "accepted"; readonly batch: PreparedObjectShapeBatch }
  | { readonly kind: "rejected"; readonly reason: string } {
  const batch: PreparedObjectShapeBatch = {
    shapes: new Map(),
    dependencies: new Map(),
    materializations: new Map(),
  };
  const added = addObjectShapesToBatch(batch, roots);
  return added.kind === "rejected"
    ? added
    : { kind: "accepted", batch };
}

export function addObjectShapesToBatch(
  { collectShapeDependencies }: CsharpObjectShapeDemandScope,
  batch: PreparedObjectShapeBatch,
  roots: readonly {
    readonly fact: CsharpObjectShapeFact;
    readonly materialization: "source" | "synthetic";
  }[],
): CsharpArtifactRequestResult {
  for (const root of roots) {
    const pending = collectShapeDependencies(root.fact);
    if (pending.kind === "rejected") {
      return pending;
    }
    for (const [key, shape] of pending.shapes) {
      const existing = batch.shapes.get(key);
      if (
        existing !== undefined &&
        !csharpObjectShapesEqual(existing, shape)
      ) {
        return rejected(
          `C# object-shape batch '${key}' has conflicting structural definitions.`,
        );
      }
      batch.shapes.set(key, shape);
      const requested = isCsharpEmptyObjectTargetType(shape.targetType)
        ? "source"
        : objectShapeMaterialization(shape);
      const current = batch.materializations.get(key);
      batch.materializations.set(
        key,
        current === "source" || requested === "source"
          ? "source"
          : "synthetic",
      );
    }
    for (const [owner, dependencies] of pending.dependencies) {
      const merged = batch.dependencies.get(owner) ?? new Set<string>();
      dependencies.forEach((dependency) => merged.add(dependency));
      batch.dependencies.set(owner, merged);
    }
  }
  return accepted;
}
export function validateObjectShapeBatch(
  { records }: CsharpObjectShapeDemandScope,
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
): CsharpArtifactRequestResult {
  let newShapeCount = 0;
  for (const [key, shape] of batch.shapes) {
    const existing = records.get(key);
    if (
      existing !== undefined &&
      !csharpObjectShapesEqual(existing.fact, shape)
    ) {
      return rejected(
        `C# object-shape artifact '${key}' has conflicting structural definitions.`,
      );
    }
    if (existing === undefined) {
      newShapeCount += 1;
    }
  }
  if (records.size + newShapeCount > maximumArtifactCount) {
    return rejected(
      `C# object-shape artifact graph exceeds its finite ${maximumArtifactCount}-shape budget.`,
    );
  }
  for (const [owner, dependencies] of batch.dependencies) {
    if (!batch.shapes.has(owner) && !records.has(owner)) {
      return rejected(
        `C# object-shape dependency owner '${owner}' is absent from the artifact transaction.`,
      );
    }
    for (const dependency of dependencies) {
      if (!batch.shapes.has(dependency) && !records.has(dependency)) {
        return rejected(
          `C# object-shape dependency '${dependency}' is absent from the artifact transaction.`,
        );
      }
    }
  }
  for (const key of capabilitiesByShape.keys()) {
    const candidate = batch.shapes.get(key) ?? records.get(key)?.fact;
    if (candidate === undefined) {
      return rejected(
        `Capability-bearing C# object shape '${key}' is absent from the artifact transaction.`,
      );
    }
    const declarationKey = objectShapeArtifactKey(candidate.declarationTemplate ?? candidate);
    if (capabilitiesByShape.get(key)?.has("method-values") &&
      ((records.get(declarationKey)?.receiverBoundMethodKeys.size ?? 0) > 0 || (receiverBoundMethodsByShape.get(declarationKey)?.size ?? 0) > 0)) {
      return rejected("Copying a receiver-bearing method requires an exact shared receiver contract; a bound CLR delegate is not equivalent.");
    }
  }
  for (const key of projectionsByShape.keys()) {
    const candidate = batch.shapes.get(key) ?? records.get(key)?.fact;
    if (candidate === undefined) {
      return rejected(
        `Projection-bearing C# object shape '${key}' is absent from the artifact transaction.`,
      );
    }
  }
  for (const [key, methodKeys] of receiverBoundMethodsByShape) {
    const candidate = batch.shapes.get(key) ?? records.get(key)?.fact;
    if (candidate === undefined) {
      return rejected(
        `Receiver-bearing C# object shape '${key}' is absent from the artifact transaction.`,
      );
    }
    const declarationKey = objectShapeArtifactKey(candidate.declarationTemplate ?? candidate);
    if (methodKeys.size > 0 && (records.get(declarationKey)?.capabilities.has("method-values") || capabilitiesByShape.get(declarationKey)?.has("method-values"))) {
      return rejected("A copied method-value contract cannot silently acquire a different receiver ABI.");
    }
    const exactMethodKeys = new Set(
      candidate.members
        .filter((member) => member.memberKind === "method")
        .map(csharpObjectShapeMemberContractKey),
    );
    for (const methodKey of methodKeys) {
      if (!exactMethodKeys.has(methodKey)) {
        return rejected(
          `Receiver-bearing C# object shape '${key}' references a member outside its exact method contract.`,
        );
      }
    }
  }
  return accepted;
}

export function commitObjectShapeBatch(
  { connect, records }: CsharpObjectShapeDemandScope,
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
): CsharpArtifactRequestResult {
  const staged = new Map<string, StagedObjectShapeRecord>();
  const affectedKeys = new Set([
    ...batch.shapes.keys(),
    ...capabilitiesByShape.keys(),
    ...projectionsByShape.keys(),
    ...receiverBoundMethodsByShape.keys(),
  ]);
  for (const key of [...affectedKeys].sort()) {
    const existing = records.get(key);
    const fact = batch.shapes.get(key) ?? existing?.fact;
    if (fact === undefined) {
      return rejected(
        `C# object-shape transaction '${key}' has no exact staged structural fact.`,
      );
    }
    const requestedMaterialization = batch.materializations.get(key) ??
      existing?.materialization ?? "synthetic";
    const dependencies = new Set(existing?.dependencies ?? []);
    batch.dependencies.get(key)?.forEach((dependency) =>
      dependencies.add(dependency)
    );
    staged.set(key, {
      fact,
      materialization:
        existing?.materialization === "source" ||
          requestedMaterialization === "source"
          ? "source"
          : "synthetic",
      capabilities: new Set([
        ...(existing?.capabilities ?? []),
        ...(capabilitiesByShape.get(key) ?? []),
      ]),
      projections: new Map([
        ...(existing?.projections ?? []),
        ...(projectionsByShape.get(key) ?? []),
      ]),
      receiverBoundMethodKeys: new Set([
        ...(existing?.receiverBoundMethodKeys ?? []),
        ...(receiverBoundMethodsByShape.get(key) ?? []),
      ]),
      dependencies,
    });
  }
  for (const [key, stagedRecord] of staged) {
    const existing = records.get(key);
    if (existing === undefined) {
      records.set(key, {
        fact: stagedRecord.fact,
        materialization: stagedRecord.materialization,
        capabilities: new Set(stagedRecord.capabilities),
        projections: new Map(stagedRecord.projections),
        receiverBoundMethodKeys: new Set(
          stagedRecord.receiverBoundMethodKeys,
        ),
        dependencies: new Set(),
        dependents: new Set(),
      });
      continue;
    }
    existing.fact = stagedRecord.fact;
    existing.materialization = stagedRecord.materialization;
    existing.capabilities.clear();
    stagedRecord.capabilities.forEach((capability) =>
      existing.capabilities.add(capability)
    );
    existing.projections.clear();
    stagedRecord.projections.forEach((projection, projectionKey) =>
      existing.projections.set(projectionKey, projection)
    );
    existing.receiverBoundMethodKeys.clear();
    stagedRecord.receiverBoundMethodKeys.forEach((methodKey) =>
      existing.receiverBoundMethodKeys.add(methodKey)
    );
  }
  for (const [owner, stagedRecord] of staged) {
    for (const dependency of stagedRecord.dependencies) {
      connect(owner, dependency);
    }
  }
  return accepted;
}
