import type {
  AstReader,
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  SourceProgramNavigation,
  TargetArtifactContractGraph,
  TargetArtifactDependency,
  TargetArtifactReconstruction,
} from "@tsonic/target-api";
import {
  createTargetArtifactContractGraph,
  sourceNodeIdentity,
} from "@tsonic/target-api";
import type {
  CsharpSourceCallableContract,
  CsharpSourceCallableArtifactIdentity,
  CsharpObjectShapeFact,
  CsharpObjectShapePolicy,
  TargetTypeRef,
} from "../../policy/types/index.js";
import type {
  CsharpStorageRequirement,
  CsharpStorageTypeResult,
  CsharpUnfulfilledStorageRequirement,
} from "./storage-requirements.js";
import {
  createCsharpStorageRequirementRegistry,
} from "./storage-requirements.js";
import type {
  CsharpGeneratedHelper,
} from "./generated-helpers.js";
import {
  createCsharpGeneratedHelperRegistry,
} from "./generated-helpers.js";
import {
  csharpObjectShapesEqual,
  getCsharpJsArrayElementTargetType,
  getCsharpNullableElementTargetType,
  getCsharpRuntimeUnionArms,
  isCsharpClosedJsonRuntimeLeaf,
  isCsharpRecordDictionaryTargetType,
  isCsharpSourceCallableArtifactDeclaration,
  isCsharpStringTargetType,
  targetTypeRefEquals,
  targetTypeRefKey,
} from "../../policy/types/index.js";
import type {
  CsharpArtifactContractCandidate,
  CsharpArtifactSnapshot,
  CsharpArtifactFacet,
} from "./contracts.js";
import {
  csharpGeneratedHelperContractCandidate,
  csharpObjectShapeContractCandidate,
  csharpSourceCallableContractCandidate,
  csharpStorageContractCandidate,
} from "./contracts.js";

export type CsharpArtifactRequestResult =
  | { readonly kind: "accepted" }
  | { readonly kind: "rejected"; readonly reason: string };

export interface CsharpObjectShapeArtifact {
  readonly key: string;
  readonly fact: CsharpObjectShapeFact;
  readonly materialization: "source" | "synthetic";
  readonly jsonSerializable: boolean;
  readonly dependencies: readonly string[];
  readonly dependents: readonly string[];
}

export interface CsharpTranslationArtifactGraph {
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
  requireJsonSerialization(
    node: Node | undefined,
    type: TargetTypeRef,
    sourceFile: SourceFile,
    rootKind: "value" | "object-shape",
  ): CsharpArtifactRequestResult;
  objectShapeRequiresJsonSerialization(
    fact: CsharpObjectShapeFact,
  ): boolean;
  objectShapeArtifacts(): readonly CsharpObjectShapeArtifact[];
  requireStorage(
    storageExpression: Node,
    requirement: CsharpStorageRequirement,
  ): CsharpArtifactRequestResult;
  resolveStorageType(
    declaration: Node,
    sourceType: TargetTypeRef,
  ): CsharpStorageTypeResult;
  requiredStorageType(storageExpression: Node): TargetTypeRef | undefined;
  consumeTypedLocationIdentity(declaration: Node): boolean;
  publishSourceCallable(
    identity: CsharpSourceCallableArtifactIdentity,
    callable: CsharpSourceCallableContract,
  ): CsharpArtifactRequestResult;
  sourceCallable(
    identity: CsharpSourceCallableArtifactIdentity,
  ): CsharpSourceCallableContract | undefined;
  unfulfilledStorageRequirements(): readonly CsharpUnfulfilledStorageRequirement[];
  requireGeneratedHelper(
    helper: CsharpGeneratedHelper,
  ): CsharpArtifactRequestResult;
  generatedHelpers(): readonly CsharpGeneratedHelper[];
  reconstructArtifact(
    owner: string,
  ): TargetArtifactReconstruction<CsharpArtifactFacet, CsharpArtifactSnapshot>;
  verifyContractClosure(): CsharpArtifactRequestResult;
}

export interface CsharpTranslationArtifactGraphHost {
  readonly ast: AstReader;
  readonly objectShapes: CsharpObjectShapePolicy;
  readonly navigation: SourceProgramNavigation;
}

interface MutableObjectShapeArtifact {
  fact: CsharpObjectShapeFact;
  materialization: "source" | "synthetic";
  jsonSerializable: boolean;
  readonly dependencies: Set<string>;
  readonly dependents: Set<string>;
}

interface JsonClosureState {
  readonly visiting: Set<string>;
  readonly collected: Map<string, CsharpObjectShapeFact>;
  depth: number;
}

interface PreparedObjectShapeBatch {
  readonly shapes: Map<string, CsharpObjectShapeFact>;
  readonly dependencies: Map<string, Set<string>>;
  readonly materializations: Map<string, "source" | "synthetic">;
}

interface StagedObjectShapeRecord {
  readonly fact: CsharpObjectShapeFact;
  readonly materialization: "source" | "synthetic";
  readonly jsonSerializable: boolean;
  readonly dependencies: ReadonlySet<string>;
}

const maximumArtifactCount = 131_072;
const maximumJsonClosureDepth = 256;

export function createCsharpTranslationArtifactGraph(
  host: CsharpTranslationArtifactGraphHost,
): CsharpTranslationArtifactGraph {
  const records = new Map<string, MutableObjectShapeArtifact>();
  const contracts = createTargetArtifactContractGraph<
    CsharpArtifactFacet,
    CsharpArtifactSnapshot
  >();
  const storage = createCsharpStorageRequirementRegistry({
    navigation: host.navigation,
    artifactOwner(declaration) {
      const identity = sourceNodeIdentity(host.ast, declaration);
      return identity === undefined ? undefined : `storage:${identity}`;
    },
  }, contracts);
  const helpers = createCsharpGeneratedHelperRegistry(contracts);
  let activeDependencies:
    | Map<string, TargetArtifactDependency<CsharpArtifactFacet>>
    | undefined;

  function captureDependencies<Value>(
    owner: string,
    build: () => Value,
  ): {
    readonly value: Value;
    readonly dependencies: readonly TargetArtifactDependency<CsharpArtifactFacet>[];
  } {
    if (activeDependencies !== undefined) {
      throw new Error(
        `C# target artifact '${owner}' attempted nested dependency capture.`,
      );
    }
    activeDependencies = new Map();
    try {
      const value = build();
      return {
        value,
        dependencies: Object.freeze(
          [...activeDependencies.values()].sort((left, right) =>
            left.owner.localeCompare(right.owner) ||
            left.facet.localeCompare(right.facet)
          ),
        ),
      };
    } finally {
      activeDependencies = undefined;
    }
  }

  function dependOn(
    owner: string,
    facet: CsharpArtifactFacet,
  ): void {
    if (activeDependencies === undefined) {
      return;
    }
    const key = `${owner.length}:${owner}${facet.length}:${facet}`;
    activeDependencies.set(key, Object.freeze({ owner, facet }));
  }

  function registerObjectShape(
    fact: CsharpObjectShapeFact,
    requestedMaterialization: "source" | "synthetic",
  ): CsharpArtifactRequestResult {
    const materialization = isSourceDeclaredNominalShape(fact)
      ? "source"
      : requestedMaterialization;
    const prepared = prepareObjectShapeBatch([{ fact, materialization }]);
    if (prepared.kind === "rejected") {
      return prepared;
    }
    let jsonShapes = new Map<string, CsharpObjectShapeFact>();
    if (implementsJsonSerializableShape(fact)) {
      const closure = collectJsonClosure(
        fact.targetType,
        fact,
        prepared.batch.shapes,
      );
      if (closure.kind === "rejected") {
        return closure;
      }
      jsonShapes = new Map(closure.shapes);
      const expanded = addObjectShapesToBatch(
        prepared.batch,
        [...closure.shapes.values()].map((shape) => ({
          fact: shape,
          materialization: isSourceDeclaredNominalShape(shape)
            ? "source" as const
            : "synthetic" as const,
        })),
      );
      if (expanded.kind === "rejected") {
        return expanded;
      }
    }
    const validation = validateObjectShapeBatch(prepared.batch, jsonShapes);
    if (validation.kind === "rejected") {
      return validation;
    }
    const committed = commitObjectShapeBatch(prepared.batch, jsonShapes);
    if (committed.kind === "accepted") {
      dependOn(
        objectShapeArtifactKey(fact),
        "object-shape-type-surface",
      );
    }
    return committed;
  }

  function requireJsonSerialization(
    node: Node | undefined,
    type: TargetTypeRef,
    sourceFile: SourceFile,
    rootKind: "value" | "object-shape",
  ): CsharpArtifactRequestResult {
    const preferredShape = node === undefined
      ? host.objectShapes.resolveTarget(type)
      : host.objectShapes.resolveNode(node, sourceFile) ??
        host.objectShapes.resolveTarget(type);
    if (rootKind === "object-shape" && preferredShape === undefined) {
      return rejected(
        "Selected JSON operation requires an exact closed object-shape argument.",
      );
    }
    const closure = collectJsonClosure(type, preferredShape);
    if (closure.kind === "rejected") {
      return closure;
    }
    const prepared = prepareObjectShapeBatch(
      [...closure.shapes.values()].map((shape) => ({
        fact: shape,
        materialization: isSourceDeclaredNominalShape(shape)
          ? "source" as const
          : "synthetic" as const,
      })),
    );
    if (prepared.kind === "rejected") {
      return prepared;
    }
    const completeClosure = collectJsonClosure(
      type,
      preferredShape,
      prepared.batch.shapes,
    );
    if (completeClosure.kind === "rejected") {
      return completeClosure;
    }
    const expanded = addObjectShapesToBatch(
      prepared.batch,
      [...completeClosure.shapes.values()].map((shape) => ({
        fact: shape,
        materialization: isSourceDeclaredNominalShape(shape)
          ? "source" as const
          : "synthetic" as const,
      })),
    );
    if (expanded.kind === "rejected") {
      return expanded;
    }
    const validation = validateObjectShapeBatch(
      prepared.batch,
      completeClosure.shapes,
    );
    if (validation.kind === "rejected") {
      return validation;
    }
    const committed = commitObjectShapeBatch(
      prepared.batch,
      completeClosure.shapes,
    );
    if (committed.kind === "accepted") {
      for (const key of completeClosure.shapes.keys()) {
        dependOn(key, "object-shape-serialization");
      }
    }
    return committed;
  }

  function objectShapeRequiresJsonSerialization(
    fact: CsharpObjectShapeFact,
  ): boolean {
    const key = objectShapeArtifactKey(fact);
    dependOn(key, "object-shape-serialization");
    return records.get(key)?.jsonSerializable === true;
  }

  function objectShapeArtifacts(): readonly CsharpObjectShapeArtifact[] {
    return [...records]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, record]) => Object.freeze({
        key,
        fact: record.fact,
        materialization: record.materialization,
        jsonSerializable: record.jsonSerializable,
        dependencies: Object.freeze([...record.dependencies].sort()),
        dependents: Object.freeze([...record.dependents].sort()),
      }));
  }

  function connect(ownerKey: string, dependencyKey: string): void {
    const owner = records.get(ownerKey);
    const dependency = records.get(dependencyKey);
    if (
      owner === undefined ||
      dependency === undefined ||
      owner.dependencies.has(dependencyKey)
    ) {
      return;
    }
    owner.dependencies.add(dependencyKey);
    dependency.dependents.add(ownerKey);
  }

  function collectShapeDependencies(
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

  function prepareObjectShapeBatch(
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

  function addObjectShapesToBatch(
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

  function validateObjectShapeBatch(
    batch: PreparedObjectShapeBatch,
    jsonShapes: ReadonlyMap<string, CsharpObjectShapeFact>,
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
    for (const [key, shape] of jsonShapes) {
      const candidate = batch.shapes.get(key) ?? records.get(key)?.fact;
      if (
        candidate === undefined ||
        !csharpObjectShapesEqual(candidate, shape)
      ) {
        return rejected(
          `Closed JSON object shape '${key}' is absent from the artifact transaction.`,
        );
      }
    }
    return accepted;
  }

  function commitObjectShapeBatch(
    batch: PreparedObjectShapeBatch,
    jsonShapes: ReadonlyMap<string, CsharpObjectShapeFact>,
  ): CsharpArtifactRequestResult {
    const staged = new Map<string, StagedObjectShapeRecord>();
    const affectedKeys = new Set([
      ...batch.shapes.keys(),
      ...jsonShapes.keys(),
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
        jsonSerializable:
          existing?.jsonSerializable === true || jsonShapes.has(key),
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
          record.jsonSerializable,
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
          jsonSerializable: stagedRecord.jsonSerializable,
          dependencies: new Set(),
          dependents: new Set(),
        });
        continue;
      }
      existing.fact = stagedRecord.fact;
      existing.materialization = stagedRecord.materialization;
      existing.jsonSerializable = stagedRecord.jsonSerializable;
    }
    for (const [owner, stagedRecord] of staged) {
      for (const dependency of stagedRecord.dependencies) {
        connect(owner, dependency);
      }
    }
    return accepted;
  }

  function collectJsonClosure(
    type: TargetTypeRef,
    preferredShape: CsharpObjectShapeFact | undefined,
    pendingShapes: ReadonlyMap<string, CsharpObjectShapeFact> = new Map(),
  ):
    | {
        readonly kind: "accepted";
        readonly shapes: ReadonlyMap<string, CsharpObjectShapeFact>;
      }
    | { readonly kind: "rejected"; readonly reason: string } {
    const state: JsonClosureState = {
      visiting: new Set(),
      collected: new Map(),
      depth: 0,
    };
    const failure = collectJsonType(type, preferredShape, state);
    if (failure !== undefined) {
      return rejected(failure);
    }
    let changed = true;
    while (changed) {
      changed = false;
      for (const shape of visibleObjectShapes(pendingShapes)) {
        if (
          state.collected.has(objectShapeArtifactKey(shape)) ||
          !(shape.implements ?? []).some((implemented) =>
            [...state.collected.values()].some((base) =>
              targetTypeRefEquals(implemented, base.targetType)
            )
          )
        ) {
          continue;
        }
        const derivedFailure = collectJsonShape(shape, state);
        if (derivedFailure !== undefined) {
          return rejected(derivedFailure);
        }
        changed = true;
      }
    }
    return { kind: "accepted", shapes: state.collected };
  }

  function visibleObjectShapes(
    pendingShapes: ReadonlyMap<string, CsharpObjectShapeFact>,
  ): readonly CsharpObjectShapeFact[] {
    const visible = new Map<string, CsharpObjectShapeFact>();
    for (const [key, record] of records) {
      visible.set(key, record.fact);
    }
    for (const [key, shape] of pendingShapes) {
      visible.set(key, shape);
    }
    return [...visible.values()];
  }

  function collectJsonType(
    type: TargetTypeRef,
    preferredShape: CsharpObjectShapeFact | undefined,
    state: JsonClosureState,
  ): string | undefined {
    if (state.depth >= maximumJsonClosureDepth) {
      return `Closed JSON target closure exceeds its finite depth limit of ${maximumJsonClosureDepth}.`;
    }
    state.depth += 1;
    try {
      const shape = preferredShape ?? host.objectShapes.resolveTarget(type);
      if (shape !== undefined) {
        return collectJsonShape(shape, state);
      }
      const nullableElement = getCsharpNullableElementTargetType(type);
      if (nullableElement !== undefined) {
        return collectJsonType(nullableElement, undefined, state);
      }
      if (
        type.kind === "source-primitive" ||
        isCsharpStringTargetType(type) ||
        isCsharpClosedJsonRuntimeLeaf(type)
      ) {
        return undefined;
      }
      if (type.kind === "array") {
        return collectJsonType(type.element, undefined, state);
      }
      const jsArrayElement = getCsharpJsArrayElementTargetType(type);
      if (jsArrayElement !== undefined) {
        return collectJsonType(jsArrayElement, undefined, state);
      }
      if (isCsharpRecordDictionaryTargetType(type)) {
        const keyType = type.typeArguments?.[0];
        const valueType = type.typeArguments?.[1];
        if (
          keyType === undefined ||
          valueType === undefined ||
          !isCsharpStringTargetType(keyType)
        ) {
          return "Closed JSON Record serialization requires an exact string key and closed value target type.";
        }
        return collectJsonType(valueType, undefined, state);
      }
      const unionArms = getCsharpRuntimeUnionArms(type);
      if (unionArms !== undefined) {
        for (const arm of unionArms) {
          const failure = collectJsonType(arm, undefined, state);
          if (failure !== undefined) {
            return failure;
          }
        }
        return undefined;
      }
      return `Target type '${targetTypeRefKey(type)}' has no closed JSON serialization policy.`;
    } finally {
      state.depth -= 1;
    }
  }

  function collectJsonShape(
    shape: CsharpObjectShapeFact,
    state: JsonClosureState,
  ): string | undefined {
    const key = objectShapeArtifactKey(shape);
    const collected = state.collected.get(key);
    if (collected !== undefined) {
      return csharpObjectShapesEqual(collected, shape)
        ? undefined
        : `Closed JSON object shape '${key}' has conflicting structural definitions.`;
    }
    if (state.visiting.has(key)) {
      return `Closed JSON object shape '${key}' is recursively self-referential.`;
    }
    state.visiting.add(key);
    for (const member of shape.members) {
      if (member.targetName === "__tsonicWriteJson") {
        state.visiting.delete(key);
        return `Closed JSON object shape '${key}' conflicts with the generated JSON writer member.`;
      }
      if (member.memberKind === "method") {
        continue;
      }
      if (member.optional === true) {
        state.visiting.delete(key);
        return `Closed JSON object shape '${key}' has optional member '${member.sourceName}' without an explicit omission policy.`;
      }
      const failure = collectJsonType(member.type, undefined, state);
      if (failure !== undefined) {
        state.visiting.delete(key);
        return failure;
      }
    }
    state.visiting.delete(key);
    state.collected.set(key, shape);
    return undefined;
  }

  function implementsJsonSerializableShape(
    fact: CsharpObjectShapeFact,
  ): boolean {
    return (fact.implements ?? []).some((implemented) =>
      [...records.values()].some((record) =>
        record.jsonSerializable &&
        targetTypeRefEquals(implemented, record.fact.targetType)
      )
    );
  }

  function requireStorage(
    storageExpression: Node,
    requirement: CsharpStorageRequirement,
  ): CsharpArtifactRequestResult {
    const result = storage.require(storageExpression, requirement);
    if (result.kind === "accepted") {
      const owner = storage.contractOwner(storageExpression);
      if (owner !== undefined) {
        dependOn(owner, "storage-representation");
      }
    }
    return result;
  }

  function resolveStorageType(
    declaration: Node,
    sourceType: TargetTypeRef,
  ): CsharpStorageTypeResult {
    const result = storage.resolve(declaration, sourceType);
    const owner = storage.contractOwner(declaration);
    if (owner !== undefined) {
      dependOn(owner, "storage-representation");
    }
    return result;
  }

  function requiredStorageType(
    storageExpression: Node,
  ): TargetTypeRef | undefined {
    const owner = storage.contractOwner(storageExpression);
    if (owner !== undefined) {
      dependOn(owner, "storage-representation");
    }
    return storage.requiredType(storageExpression);
  }

  function consumeTypedLocationIdentity(declaration: Node): boolean {
    const owner = storage.contractOwner(declaration);
    if (owner !== undefined) {
      dependOn(owner, "storage-representation");
    }
    return storage.consumeTypedLocationIdentity(declaration);
  }

  function publishSourceCallable(
    identity: CsharpSourceCallableArtifactIdentity,
    callable: CsharpSourceCallableContract,
  ): CsharpArtifactRequestResult {
    if (
      identity.kind === "declaration" &&
      (
        callable.sourceDeclaration !== identity.declaration ||
        !isCsharpSourceCallableArtifactDeclaration(
          host.ast,
          identity.declaration,
        )
      )
    ) {
      return rejected(
        "A C# source-callable contract must be owned by its exact emitted callable declaration.",
      );
    }
    const owner = sourceCallableArtifactOwner(identity);
    if (owner === undefined) {
      return rejected(
        "A C# source-callable contract has no stable compiler-owned declaration identity.",
      );
    }
    const candidate = csharpSourceCallableContractCandidate(owner, callable);
    const committed = contracts.commit(
      candidate.owner,
      candidate.contract,
      candidate.dependencies,
      candidate.artifact,
    );
    if (committed.kind === "rejected") {
      return rejected(committed.reason);
    }
    dependOn(owner, "source-callable-surface");
    return accepted;
  }

  function sourceCallable(
    identity: CsharpSourceCallableArtifactIdentity,
  ): CsharpSourceCallableContract | undefined {
    if (
      identity.kind === "declaration" &&
      !isCsharpSourceCallableArtifactDeclaration(host.ast, identity.declaration)
    ) {
      return undefined;
    }
    const owner = sourceCallableArtifactOwner(identity);
    if (owner === undefined) {
      return undefined;
    }
    dependOn(owner, "source-callable-surface");
    const artifact = contracts.artifact(owner);
    return artifact?.kind === "source-callable"
      ? artifact.callable
      : undefined;
  }

  function sourceCallableArtifactOwner(
    identity: CsharpSourceCallableArtifactIdentity,
  ): string | undefined {
    if (identity.kind === "project-constructor") {
      return identity.targetMemberId.length === 0
        ? undefined
        : `source-callable:project-constructor:${identity.targetMemberId}`;
    }
    const declarationIdentity = sourceNodeIdentity(
      host.ast,
      identity.declaration,
    );
    return declarationIdentity === undefined
      ? undefined
      : `source-callable:declaration:${declarationIdentity}`;
  }

  function requireGeneratedHelper(
    helper: CsharpGeneratedHelper,
  ): CsharpArtifactRequestResult {
    const result = helpers.require(helper);
    if (result.kind === "accepted") {
      dependOn(
        `generated-helper:${helper}`,
        "generated-helper-surface",
      );
    }
    return result;
  }

  function reconstructArtifact(
    owner: string,
  ): TargetArtifactReconstruction<CsharpArtifactFacet, CsharpArtifactSnapshot> {
    const artifact = contracts.artifact(owner);
    if (artifact === undefined) {
      return {
        kind: "rejected",
        code: "CSHARP_TARGET_ARTIFACT_RECONSTRUCTOR_MISSING",
        reason: `Dirty C# target artifact '${owner}' has no published target-owned snapshot.`,
      };
    }
    switch (artifact.kind) {
      case "generated-helper":
        return resolvedArtifact(
          csharpGeneratedHelperContractCandidate(artifact.helper),
        );
      case "object-shape": {
        const record = records.get(owner);
        if (record === undefined) {
          return {
            kind: "rejected",
            code: "CSHARP_OBJECT_SHAPE_RECONSTRUCTOR_MISSING",
            reason:
              `Dirty C# object-shape artifact '${owner}' has no canonical target-owned shape record.`,
          };
        }
        return resolvedArtifact(csharpObjectShapeContractCandidate(
          owner,
          record.fact,
          record.materialization,
          record.jsonSerializable,
          [...record.dependencies].sort(),
        ));
      }
      case "source-callable":
        return resolvedArtifact(
          csharpSourceCallableContractCandidate(owner, artifact.callable),
        );
      case "storage":
        return resolvedArtifact(csharpStorageContractCandidate(
          owner,
          artifact.targetType,
          artifact.nullableWrittenType,
          artifact.typedLocationIdentity,
        ));
      case "source-file":
        return {
          kind: "rejected",
          code: "CSHARP_SOURCE_FILE_RECONSTRUCTOR_OWNERSHIP_INVALID",
          reason:
            `Dirty C# source-file artifact '${owner}' must be reconstructed by its source-file planner.`,
        };
    }
  }

  function verifyContractClosure(): CsharpArtifactRequestResult {
    if (contracts.hasPending()) {
      return rejected(
        "C# target artifact contracts retain dirty dependents after reconstruction.",
      );
    }
    const closure = contracts.verifyClosure();
    return closure.kind === "closed" ? accepted : rejected(closure.reason);
  }

  return Object.freeze({
    get revision(): number {
      return contracts.revision;
    },
    contractGraph: contracts,
    captureDependencies,
    registerObjectShape,
    requireJsonSerialization,
    objectShapeRequiresJsonSerialization,
    objectShapeArtifacts,
    requireStorage,
    resolveStorageType,
    requiredStorageType,
    consumeTypedLocationIdentity,
    publishSourceCallable,
    sourceCallable,
    unfulfilledStorageRequirements: storage.unfulfilled,
    requireGeneratedHelper,
    generatedHelpers: helpers.required,
    reconstructArtifact,
    verifyContractClosure,
  });
}

function resolvedArtifact(
  candidate: CsharpArtifactContractCandidate,
): TargetArtifactReconstruction<CsharpArtifactFacet, CsharpArtifactSnapshot> {
  return {
    kind: "resolved",
    contract: candidate.contract,
    dependencies: candidate.dependencies,
    artifact: candidate.artifact,
  };
}

const accepted = Object.freeze({ kind: "accepted" as const });

function rejected(reason: string): {
  readonly kind: "rejected";
  readonly reason: string;
} {
  return { kind: "rejected", reason };
}

function objectShapeArtifactKey(fact: CsharpObjectShapeFact): string {
  return `object-shape:${targetTypeRefKey(fact.targetType)}`;
}

function isSourceDeclaredNominalShape(fact: CsharpObjectShapeFact): boolean {
  return fact.targetType.kind === "target-named" &&
    (fact.targetType as {
      readonly csharpSourceDeclarationKind?: unknown;
    }).csharpSourceDeclarationKind !== undefined;
}
