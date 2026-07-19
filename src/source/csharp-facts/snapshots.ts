import type {
  ExtensionEvidence,
  ExtensionFactSubject,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  CsharpArrayBoundaryFact,
  CsharpArrayCarrierFact,
  CsharpAttributeApplicationFact,
  CsharpByrefStorageFact,
  CsharpJsonSerializableShapeFact,
  CsharpObjectShapeFact,
  CsharpObservedTargetAssignabilityFact,
  CsharpProjectSourceFact,
  CsharpRegularExpressionLiteralFact,
  CsharpPropagatedRuntimeCarrierFact,
  CsharpSelectedCallTargetFact,
  CsharpSourceProfileDeclarationFact,
  CsharpSourceReturnCarrierFact,
  CsharpTargetIterationFact,
  CsharpTargetNameFact,
  CsharpTargetOperationFact,
  CsharpTargetTypeParameterConstraintFact,
} from "./types.js";

const targetTypeKinds = new Set([
  "source-primitive",
  "source-global",
  "target-named",
  "type-parameter",
  "array",
  "tuple",
  "pointer",
  "function-pointer",
  "opaque",
  "associated-type",
  "lifetime",
  "target-specific",
]);

const snapshotLimits = {
  maximumDepth: 128,
  maximumObjects: 65_536,
  maximumCollectionEntries: 262_144,
} as const;

interface SnapshotState {
  readonly completed: WeakMap<object, object>;
  readonly active: WeakSet<object>;
  objectCount: number;
  collectionEntryCount: number;
}

export function snapshotCsharpObjectShapeFact(value: CsharpObjectShapeFact): CsharpObjectShapeFact {
  return Object.freeze({
    targetType: snapshotTargetTypeRef(value.targetType),
    members: Object.freeze(value.members.map((member) => Object.freeze({
      sourceName: member.sourceName,
      ...(member.sourceSubjects === undefined ? {} : {
        sourceSubjects: snapshotOpaqueSubjectArray(member.sourceSubjects),
      }),
      targetName: member.targetName,
      memberKind: member.memberKind,
      type: snapshotTargetTypeRef(member.type),
      ...(member.optional === undefined ? {} : { optional: member.optional }),
      ...(member.readonly === undefined ? {} : { readonly: member.readonly }),
    }))),
    ...(value.implements === undefined ? {} : {
      implements: Object.freeze(value.implements.map(snapshotTargetTypeRef)),
    }),
    ...(value.constructible === undefined ? {} : { constructible: value.constructible }),
  });
}

export function snapshotCsharpJsonSerializableShapeFact(value: CsharpJsonSerializableShapeFact): CsharpJsonSerializableShapeFact {
  return Object.freeze({ kind: value.kind });
}

export function snapshotCsharpTargetNameFact(value: CsharpTargetNameFact): CsharpTargetNameFact {
  return Object.freeze({ name: value.name });
}

export function snapshotCsharpAttributeApplicationFact(value: CsharpAttributeApplicationFact): CsharpAttributeApplicationFact {
  return Object.freeze({
    attributeType: value.attributeType,
    attributeName: value.attributeName,
    ...(value.arguments === undefined ? {} : { arguments: snapshotOpaqueSubjectArray(value.arguments) }),
    applicationTarget: value.applicationTarget,
    ...(value.applicationPlacement === undefined ? {} : { applicationPlacement: value.applicationPlacement }),
    ...(value.applicationParameterName === undefined ? {} : { applicationParameterName: value.applicationParameterName }),
    ...(value.applicationTargetSpecifier === undefined ? {} : { applicationTargetSpecifier: value.applicationTargetSpecifier }),
  });
}

export function snapshotCsharpTargetTypeParameterConstraintFact(
  value: CsharpTargetTypeParameterConstraintFact,
): CsharpTargetTypeParameterConstraintFact {
  return Object.freeze({
    constraints: snapshotOwnedData(value.constraints, "typeParameterConstraint.constraints"),
  });
}

export function snapshotCsharpObservedTargetAssignabilityFact(
  value: CsharpObservedTargetAssignabilityFact,
): CsharpObservedTargetAssignabilityFact {
  return Object.freeze({
    source: value.source,
    target: value.target,
    ...(value.relation === undefined ? {} : { relation: value.relation }),
    ...(value.errorNode === undefined ? {} : { errorNode: value.errorNode }),
    ...(value.expression === undefined ? {} : { expression: value.expression }),
  });
}

export function snapshotCsharpTargetIterationFact(value: CsharpTargetIterationFact): CsharpTargetIterationFact {
  return Object.freeze({
    operationId: value.operationId,
    iterationKind: value.iterationKind,
    lowering: snapshotOwnedData(value.lowering, "targetIteration.lowering"),
    ...(value.elementType === undefined ? {} : {
      elementType: snapshotTargetTypeRefSubject(value.elementType),
    }),
    ...(value.evidence === undefined ? {} : {
      evidence: snapshotEvidence(value.evidence),
    }),
  });
}

export function snapshotCsharpTargetOperationFact(value: CsharpTargetOperationFact): CsharpTargetOperationFact {
  return snapshotOwnedData(value, "targetOperation");
}

export function snapshotCsharpSelectedCallTargetFact(value: CsharpSelectedCallTargetFact): CsharpSelectedCallTargetFact {
  return snapshotOwnedData(value, "selectedCallTarget");
}

export function snapshotCsharpRegularExpressionLiteralFact(
  value: CsharpRegularExpressionLiteralFact,
): CsharpRegularExpressionLiteralFact {
  return Object.freeze({ pattern: value.pattern, flags: value.flags });
}

export function snapshotCsharpArrayCarrierFact(value: CsharpArrayCarrierFact): CsharpArrayCarrierFact {
  return Object.freeze({
    sourceKind: value.sourceKind,
    lane: value.lane,
    elementType: snapshotTargetTypeRef(value.elementType),
    carrierType: snapshotTargetTypeRef(value.carrierType),
    mutationVisibility: value.mutationVisibility,
    boundary: value.boundary,
  });
}

export function snapshotCsharpArrayBoundaryFact(value: CsharpArrayBoundaryFact): CsharpArrayBoundaryFact {
  return Object.freeze({
    publicShape: value.publicShape,
    publicType: snapshotTargetTypeRef(value.publicType),
    coreCarrierLane: value.coreCarrierLane,
    coreCarrierType: snapshotTargetTypeRef(value.coreCarrierType),
    preservesMutationVisibility: value.preservesMutationVisibility,
    requiresCopyIn: value.requiresCopyIn,
    requiresCopyOut: value.requiresCopyOut,
  });
}

export function snapshotCsharpSourceReturnCarrierFact(value: CsharpSourceReturnCarrierFact): CsharpSourceReturnCarrierFact {
  return Object.freeze({ carrier: snapshotTargetTypeRef(value.carrier) });
}

export function snapshotCsharpPropagatedRuntimeCarrierFact(
  value: CsharpPropagatedRuntimeCarrierFact,
): CsharpPropagatedRuntimeCarrierFact {
  return Object.freeze({
    carrier: snapshotTargetTypeRef(value.carrier),
  });
}

export function snapshotCsharpProjectSourceFact(value: CsharpProjectSourceFact): CsharpProjectSourceFact {
  return Object.freeze({ kind: value.kind });
}

export function snapshotCsharpSourceProfileDeclarationFact(
  value: CsharpSourceProfileDeclarationFact,
): CsharpSourceProfileDeclarationFact {
  return Object.freeze({
    ownerId: value.ownerId,
    kind: value.kind,
    name: value.name,
    ...(value.declaringName === undefined ? {} : { declaringName: value.declaringName }),
  });
}

export function snapshotCsharpByrefStorageFact(value: CsharpByrefStorageFact): CsharpByrefStorageFact {
  return Object.freeze({ targetType: snapshotTargetTypeRef(value.targetType) });
}

function snapshotTargetTypeRef(value: TargetTypeRef): TargetTypeRef {
  return snapshotOwnedData(value, "targetTypeRef");
}

function snapshotTargetTypeRefSubject(value: ExtensionFactSubject): ExtensionFactSubject {
  return isTargetTypeRef(value) ? snapshotTargetTypeRef(value) : value;
}

function isTargetTypeRef(value: ExtensionFactSubject): value is TargetTypeRef {
  return typeof (value as { readonly kind?: unknown }).kind === "string" &&
    targetTypeKinds.has((value as { readonly kind: string }).kind);
}

function snapshotOpaqueSubjectArray(values: readonly ExtensionFactSubject[]): readonly ExtensionFactSubject[] {
  return Object.freeze([...values]);
}

function snapshotEvidence(values: readonly ExtensionEvidence[]): readonly ExtensionEvidence[] {
  return snapshotOwnedData(values, "evidence");
}

function snapshotOwnedData<T>(value: T, path: string): T {
  const state: SnapshotState = {
    completed: new WeakMap(),
    active: new WeakSet(),
    objectCount: 0,
    collectionEntryCount: 0,
  };
  return snapshotOwnedDataValue(value, path, state, 0);
}

function snapshotOwnedDataValue<T>(value: T, path: string, state: SnapshotState, depth: number): T {
  if (value === null || typeof value !== "object") {
    if (typeof value === "function" || typeof value === "symbol") {
      throw new Error(`C# fact snapshot '${path}' contains unsupported ${typeof value} data.`);
    }
    return value;
  }
  if (depth > snapshotLimits.maximumDepth) {
    throw new Error(`C# fact snapshot '${path}' exceeds the maximum depth of ${snapshotLimits.maximumDepth}.`);
  }
  const source = value as object;
  const completed = state.completed.get(source);
  if (completed !== undefined) {
    return completed as T;
  }
  if (state.active.has(source)) {
    throw new Error(`C# fact snapshot '${path}' contains a cycle.`);
  }
  state.objectCount += 1;
  if (state.objectCount > snapshotLimits.maximumObjects) {
    throw new Error(`C# fact snapshot '${path}' exceeds the maximum object count of ${snapshotLimits.maximumObjects}.`);
  }
  state.active.add(source);
  try {
    if (Array.isArray(value)) {
      reserveCollectionEntries(value.length, path, state);
      const snapshot = value.map((entry, index) => snapshotOwnedDataValue(entry, `${path}[${index}]`, state, depth + 1));
      const frozen = Object.freeze(snapshot) as T;
      state.completed.set(source, frozen as object);
      return frozen;
    }
    const prototype = Object.getPrototypeOf(source);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error(`C# fact snapshot '${path}' contains a non-plain object.`);
    }
    const keys = Reflect.ownKeys(source);
    reserveCollectionEntries(keys.length, path, state);
    const snapshot: Record<string, unknown> = {};
    for (const key of keys) {
      if (typeof key !== "string") {
        throw new Error(`C# fact snapshot '${path}' contains a symbol-keyed field.`);
      }
      const descriptor = Object.getOwnPropertyDescriptor(source, key);
      if (descriptor === undefined || !("value" in descriptor) || descriptor.enumerable !== true) {
        throw new Error(`C# fact snapshot '${path}.${key}' must be an enumerable data field.`);
      }
      if (key === "sourceDeclaringType") {
        snapshot[key] = descriptor.value;
        continue;
      }
      if (key === "sourceSubjects") {
        if (!Array.isArray(descriptor.value)) {
          throw new Error(`C# fact snapshot '${path}.${key}' must be an array.`);
        }
        snapshot[key] = Object.freeze([...descriptor.value]);
        continue;
      }
      snapshot[key] = snapshotOwnedDataValue(descriptor.value, `${path}.${key}`, state, depth + 1);
    }
    const frozen = Object.freeze(snapshot) as T;
    state.completed.set(source, frozen as object);
    return frozen;
  } finally {
    state.active.delete(source);
  }
}

function reserveCollectionEntries(count: number, path: string, state: SnapshotState): void {
  state.collectionEntryCount += count;
  if (state.collectionEntryCount > snapshotLimits.maximumCollectionEntries) {
    throw new Error(`C# fact snapshot '${path}' exceeds the maximum collection-entry count of ${snapshotLimits.maximumCollectionEntries}.`);
  }
}
