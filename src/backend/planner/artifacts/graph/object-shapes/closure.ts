import type {
  CsharpObjectShapeFact,
  CsharpObjectShapeCapability,
  CsharpObjectShapeProjection,
  TargetTypeRef,
} from "../../../../../target-model/types/index.js";
import type { CsharpArtifactGraphScope } from "../engine.js";
import type { JsonClosureState } from "../model.js";
import {
  csharpObjectShapesEqual,
  csharpObjectShapeProjectionMembers,
  isCsharpObjectShapeGeneratedMemberName,
  getCsharpJsArrayElementTargetType,
  getCsharpNullableElementTargetType,
  getCsharpRuntimeUnionArms,
  isCsharpClosedJsonRuntimeLeaf,
  isCsharpRecordDictionaryTargetType,
  isCsharpStringTargetType,
  targetTypeRefEquals,
  targetTypeRefKey,
} from "../../../../../target-model/types/index.js";
import { rejected } from "../result.js";
import { maximumJsonClosureDepth } from "../model.js";
import { objectShapeArtifactKey } from "./identity.js";
import { objectShapeProjectionKey } from "../../contracts.js";

export function collectJsonClosure(
  { collectJsonShape, collectJsonType, visibleObjectShapes }: CsharpArtifactGraphScope,
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
  { collectJsonClosure }: CsharpArtifactGraphScope,
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
      return collectJsonClosure(type, preferredShape, pendingShapes);
  }
}


export function addShapeCapabilities(
  {  }: CsharpArtifactGraphScope,
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
  {  }: CsharpArtifactGraphScope,
  shapes: ReadonlyMap<string, CsharpObjectShapeFact>,
  projection: CsharpObjectShapeProjection,
): string | undefined {
  for (const [key, shape] of shapes) {
    if (csharpObjectShapeProjectionMembers(shape, projection) === undefined) {
      return `Closed object projection '${key}' does not identify every exact own member once.`;
    }
    for (const member of shape.members) {
      if (isCsharpObjectShapeGeneratedMemberName(member.targetName)) {
        return `Closed object projection '${key}' conflicts with generated member '${member.targetName}'.`;
      }
    }
  }
  return undefined;
}


export function addShapeProjection(
  {  }: CsharpArtifactGraphScope,
  target: Map<string, Map<string, CsharpObjectShapeProjection>>,
  shapes: ReadonlyMap<string, CsharpObjectShapeFact>,
  projection: CsharpObjectShapeProjection,
): void {
  const projectionKey = objectShapeProjectionKey(projection);
  for (const key of shapes.keys()) {
    const projections = target.get(key) ??
      new Map<string, CsharpObjectShapeProjection>();
    projections.set(projectionKey, projection);
    target.set(key, projections);
  }
}


export function visibleObjectShapes(
  { records }: CsharpArtifactGraphScope,
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
  { collectJsonShape, collectJsonType, host }: CsharpArtifactGraphScope,
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


export function collectJsonShape(
  { collectJsonType }: CsharpArtifactGraphScope,
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


export function inheritedObjectShapeCapabilities(
  { records }: CsharpArtifactGraphScope,
  fact: CsharpObjectShapeFact,
): readonly CsharpObjectShapeCapability[] {
  const inherited = new Set<CsharpObjectShapeCapability>();
  for (const implemented of fact.implements ?? []) {
    for (const record of records.values()) {
      if (targetTypeRefEquals(implemented, record.fact.targetType)) {
        record.capabilities.forEach((capability) => inherited.add(capability));
      }
    }
  }
  return Object.freeze([...inherited].sort());
}
