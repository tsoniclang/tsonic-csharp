import type { CsharpObjectShapeFact, CsharpObjectShapeCapability, CsharpObjectShapeProjection, TargetTypeRef } from "../../target-model/types/index.js";
import type { CsharpObjectShapeDemandScope } from "./native-demand-batches.js";
import type { JsonClosureState } from "./native-demand-batches.js";
import type { CsharpObjectShapeProjectionAdmission } from "../../target-model/records/objects/object-shape-demand.js";
import { csharpObjectShapesEqual, csharpObjectShapeAssignmentMembers, csharpObjectShapeProjectionMembers, getCsharpJsArrayElementTargetType, getCsharpNullableElementTargetType, getCsharpRuntimeUnionArms, isCsharpAbsenceTargetType, isCsharpClosedJsonRuntimeLeaf, isCsharpRecordDictionaryTargetType, isCsharpStringTargetType, targetTypeRefEquals, targetTypeRefKey } from "../../target-model/types/index.js";
import { rejected } from "./native-demand-batches.js";
import { maximumJsonClosureDepth } from "./native-demand-batches.js";
import { objectShapeArtifactKey } from "../../target-model/records/objects/object-shape-keys.js";
import { objectShapeProjectionKey } from "../../target-model/records/objects/object-shape-keys.js";
import { collectCsharpReferenceClosure } from "./native-demand-references.js";
import { resolveCsharpSourceClassStorage } from "./native-demand-storage.js";
import { selectCsharpJsonObjectShapeContract } from "../../policy/types/objects/json-object-shapes.js";

export function collectJsonClosure(
  { collectJsonShape, collectJsonType, visibleObjectShapes }: CsharpObjectShapeDemandScope,
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

export function collectCapabilityClosure(
  scope: CsharpObjectShapeDemandScope,
  capability: CsharpObjectShapeCapability,
  type: TargetTypeRef,
  preferredShape: CsharpObjectShapeFact | undefined,
  pendingShapes: ReadonlyMap<string, CsharpObjectShapeFact> = new Map(),
):
  | {
      readonly kind: "accepted";
      readonly shapes: ReadonlyMap<string, CsharpObjectShapeFact>;
    }
  | { readonly kind: "rejected"; readonly reason: string } {
  switch (capability) {
    case "json-serialization":
      return scope.collectJsonClosure(type, preferredShape, pendingShapes);
    case "js-freeze":
    case "reference-identity":
    case "method-values":
    case "enumerable-keys":
      return collectCsharpReferenceClosure(scope, type, preferredShape, pendingShapes, capability);
  }
}

export function addShapeCapabilities(
  {  }: CsharpObjectShapeDemandScope,
  target: Map<string, Set<CsharpObjectShapeCapability>>,
  shapes: ReadonlyMap<string, CsharpObjectShapeFact>,
  capability: CsharpObjectShapeCapability,
): void {
  for (const key of shapes.keys()) {
    const capabilities = target.get(key) ?? new Set<CsharpObjectShapeCapability>();
    capabilities.add(capability);
    target.set(key, capabilities);
  }
}

export function validateProjectionShapes(
  {  }: CsharpObjectShapeDemandScope,
  shapes: ReadonlyMap<string, CsharpObjectShapeFact>,
  projection: CsharpObjectShapeProjection,
): string | undefined {
  for (const [key, shape] of shapes) {
    const members = projection.kind === "assign"
      ? csharpObjectShapeAssignmentMembers(shape, projection)
      : csharpObjectShapeProjectionMembers(shape, projection);
    if (members === undefined) {
      return `Closed object projection '${key}' does not identify every exact own member once.`;
    }
  }
  return undefined;
}

export function addShapeProjection(
  {  }: CsharpObjectShapeDemandScope,
  target: Map<string, Map<string, CsharpObjectShapeProjectionAdmission>>,
  shapes: ReadonlyMap<string, CsharpObjectShapeFact>,
  projection: CsharpObjectShapeProjectionAdmission,
): void {
  const projectionKey = objectShapeProjectionKey(projection.selection);
  for (const key of shapes.keys()) {
    const projections = target.get(key) ??
      new Map<string, CsharpObjectShapeProjectionAdmission>();
    projections.set(projectionKey, projection);
    target.set(key, projections);
  }
}

export function visibleObjectShapes(
  { records }: CsharpObjectShapeDemandScope,
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

export function collectJsonType(
  { collectJsonShape, collectJsonType, host }: CsharpObjectShapeDemandScope,
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
      isCsharpAbsenceTargetType(type) ||
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
    const unionArms = getCsharpRuntimeUnionArms(type, host.typeDefinitions);
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

export function collectJsonShape(
  { collectJsonType, jsonContracts }: CsharpObjectShapeDemandScope,
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
  let contract = jsonContracts.get(shape);
  if (contract === undefined) {
    contract = selectCsharpJsonObjectShapeContract({ shape });
    jsonContracts.set(shape, contract);
  }
  if (contract.kind === "rejected") {
    state.visiting.delete(key);
    return contract.reason;
  }
  if (contract.contract.kind === "to-json") {
    const failure = collectJsonType(
      contract.contract.returnType,
      undefined,
      state,
    );
    state.visiting.delete(key);
    if (failure !== undefined) {
      return failure;
    }
    state.collected.set(key, shape);
    return undefined;
  }
  for (const member of shape.members) {
    if (
      member.targetName === "__tsonicWriteJson" ||
      member.targetName === "__tsonicJsonValue"
    ) {
      state.visiting.delete(key);
      return `Closed JSON object shape '${key}' conflicts with a generated JSON contract member.`;
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

export function inheritedObjectShapeCapabilities(
  scope: CsharpObjectShapeDemandScope,
  fact: CsharpObjectShapeFact,
): readonly CsharpObjectShapeCapability[] {
  const inherited = new Set<CsharpObjectShapeCapability>();
  for (const implemented of fact.implements ?? []) {
    for (const record of scope.records.values()) {
      if (targetTypeRefEquals(implemented, record.fact.targetType)) {
        record.capabilities.forEach((capability) => inherited.add(capability));
      }
    }
  }
  const nativeBase = resolveCsharpSourceClassStorage(scope, fact.targetType)?.baseType;
  const nativeOwner = nativeBase === undefined ? undefined
    : resolveCsharpSourceClassStorage(scope, nativeBase)?.declaration.targetType;
  if (nativeBase !== undefined) for (const record of scope.records.values()) {
    if (record.capabilities.has("js-freeze") &&
      (targetTypeRefEquals(nativeBase, record.fact.targetType) ||
        nativeOwner !== undefined && targetTypeRefEquals(nativeOwner, record.fact.targetType))) {
      inherited.add("js-freeze");
    }
  }
  return Object.freeze([...inherited].sort());
}
