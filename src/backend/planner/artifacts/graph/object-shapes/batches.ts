import type { CsharpArtifactGraphScope } from "../engine.js";
import type { CsharpArtifactRequestResult, PreparedObjectShapeBatch, StagedObjectShapeRecord } from "../model.js";
import type { CsharpObjectShapeFact, CsharpObjectShapeCapability, CsharpObjectShapeProjection } from "../../../../../target-model/types/index.js";
import { accepted, rejected } from "../result.js";
import { csharpObjectShapeContractCandidate } from "../../contracts.js";
import { csharpObjectShapesEqual, csharpObjectShapeMemberContractKey } from "../../../../../target-model/types/index.js";
import { maximumArtifactCount } from "../model.js";
import { objectShapeArtifactKey, isSourceDeclaredNominalShape } from "./identity.js";

export function collectShapeDependencies(
  { host }: CsharpArtifactGraphScope,
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
    const targets = [
      ...shape.members
        .filter((member) => member.memberKind !== "method")
        .map((member) => member.type),
      ...(shape.implements ?? []),
    ];
    for (const target of targets) {
      const nested = host.objectShapes.resolveTarget(target);
      if (nested === undefined) {
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
  { addObjectShapesToBatch }: CsharpArtifactGraphScope,
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
  { collectShapeDependencies }: CsharpArtifactGraphScope,
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
      const requested = isSourceDeclaredNominalShape(shape)
        ? "source"
        : root.materialization;
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
  { records }: CsharpArtifactGraphScope,
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
  { connect, contracts, records }: CsharpArtifactGraphScope,
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
  const candidates = [...staged]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, record]) =>
      csharpObjectShapeContractCandidate(
        key,
        record.fact,
        record.materialization,
        record.capabilities,
        [...record.projections.values()],
        record.receiverBoundMethodKeys,
        [...record.dependencies].sort(),
      )
    );
  const committed = contracts.commitBatch(candidates);
  if (committed.kind === "rejected") {
    return rejected(committed.reason);
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
