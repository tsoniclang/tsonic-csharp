import type {
  CsharpTargetNamedTypeRef,
  CsharpTargetTypeRenderShape,
} from "../csharp-source-semantics/target-types.js";
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
  CsharpRuntimeCarrierFact,
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

export function snapshotCsharpRuntimeCarrierFact(
  value: CsharpRuntimeCarrierFact,
): CsharpRuntimeCarrierFact {
  assertExactFields(value, "runtimeCarrier", ["carrier"]);
  return Object.freeze({
    carrier: snapshotCsharpTargetTypeRef(value.carrier),
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

export function snapshotCsharpTargetTypeRef<T extends TargetTypeRef>(value: T): T {
  validateCsharpTargetTypeRef(value, "targetTypeRef", {
    active: new WeakSet(),
    completed: new WeakSet(),
  });
  return snapshotOwnedData(value, "targetTypeRef");
}

interface TargetTypeValidationState {
  readonly active: WeakSet<object>;
  readonly completed: WeakSet<object>;
}

const sourcePrimitiveKinds = new Set([
  "bool",
  "char",
  "int8",
  "uint8",
  "int16",
  "uint16",
  "int32",
  "uint32",
  "int64",
  "uint64",
  "native-int",
  "native-uint",
  "float16",
  "float32",
  "float64",
  "decimal",
  "int128",
  "uint128",
]);

const targetNamedCsharpFields = [
  "csharpNullableReference",
  "csharpRender",
  "csharpThrowable",
  "csharpTypeofRuntimeKind",
  "csharpSpecialType",
  "csharpSourceDeclarationKind",
  "csharpBaseType",
  "csharpValueType",
  "csharpArrayLiteralElementType",
  "csharpArrayLiteralConstructionType",
  "csharpEnumerableElementType",
  "csharpReadOnlyIndexableElementType",
  "csharpDenseMutableElementType",
  "csharpDelegateSignature",
  "csharpTaskResultType",
  "csharpRuntimeUnionArms",
  "csharpRuntimeUnionObjectShapes",
  "csharpJsSurfaceKind",
  "csharpCollectionSurface",
] as const;

function validateCsharpTargetTypeRef(
  value: TargetTypeRef,
  path: string,
  state: TargetTypeValidationState,
): void {
  if (!enterValidationObject(value, path, state)) {
    return;
  }
  try {
    switch (value.kind) {
      case "source-primitive":
        assertExactFields(value, path, ["kind", "name", "csharpNullableReference"]);
        assertAllowedString(value.name, `${path}.name`, sourcePrimitiveKinds);
        break;
      case "source-global":
        assertExactFields(value, path, ["kind", "name", "typeArguments", "csharpNullableReference"]);
        assertString(value.name, `${path}.name`);
        validateOptionalTargetTypeArray(value.typeArguments, `${path}.typeArguments`, state);
        break;
      case "target-named":
        assertExactFields(value, path, ["kind", "id", "typeArguments", ...targetNamedCsharpFields]);
        assertString(value.id, `${path}.id`);
        validateOptionalTargetTypeArray(value.typeArguments, `${path}.typeArguments`, state);
        validateCsharpTargetNamedMetadata(value as CsharpTargetNamedTypeRef, path, state);
        break;
      case "type-parameter":
        assertExactFields(value, path, ["kind", "name", "csharpNullableReference"]);
        assertString(value.name, `${path}.name`);
        break;
      case "array":
        assertExactFields(value, path, ["kind", "element", "rank", "csharpNullableReference"]);
        validateCsharpTargetTypeRef(value.element, `${path}.element`, state);
        assertOptionalPositiveInteger(value.rank, `${path}.rank`);
        break;
      case "tuple":
        assertExactFields(value, path, ["kind", "elements", "csharpNullableReference"]);
        validateTargetTypeArray(value.elements, `${path}.elements`, state);
        break;
      case "pointer":
        assertExactFields(value, path, ["kind", "pointee", "mutability", "csharpNullableReference"]);
        validateCsharpTargetTypeRef(value.pointee, `${path}.pointee`, state);
        assertOptionalAllowedString(value.mutability, `${path}.mutability`, new Set(["const", "mut", "target-defined"]));
        break;
      case "function-pointer":
        assertExactFields(value, path, ["kind", "args", "result", "abi", "csharpNullableReference"]);
        validateTargetTypeArray(value.args, `${path}.args`, state);
        validateCsharpTargetTypeRef(value.result, `${path}.result`, state);
        assertOptionalStringArray(value.abi, `${path}.abi`, state);
        break;
      case "opaque":
        assertExactFields(value, path, ["kind", "id", "csharpNullableReference"]);
        assertString(value.id, `${path}.id`);
        break;
      case "associated-type":
        assertExactFields(value, path, ["kind", "owner", "name", "csharpNullableReference"]);
        validateCsharpTargetTypeRef(value.owner, `${path}.owner`, state);
        assertString(value.name, `${path}.name`);
        break;
      case "lifetime":
        assertExactFields(value, path, ["kind", "name", "csharpNullableReference"]);
        assertString(value.name, `${path}.name`);
        break;
      case "target-specific":
        assertExactFields(value, path, ["kind", "target", "name", "payloadId", "csharpNullableReference"]);
        assertString(value.target, `${path}.target`);
        assertString(value.name, `${path}.name`);
        assertOptionalString(value.payloadId, `${path}.payloadId`);
        break;
    }
    assertOptionalTrue((value as { readonly csharpNullableReference?: unknown }).csharpNullableReference, `${path}.csharpNullableReference`);
  } finally {
    leaveValidationObject(value, state);
  }
}

function validateCsharpTargetNamedMetadata(
  value: CsharpTargetNamedTypeRef,
  path: string,
  state: TargetTypeValidationState,
): void {
  if (value.csharpRender !== undefined) {
    validateCsharpRenderShape(value.csharpRender, `${path}.csharpRender`, state);
  }
  assertOptionalTrue(value.csharpThrowable, `${path}.csharpThrowable`);
  assertOptionalAllowedString(value.csharpTypeofRuntimeKind, `${path}.csharpTypeofRuntimeKind`, new Set(["string", "number", "boolean", "bigint"]));
  assertOptionalAllowedString(value.csharpSpecialType, `${path}.csharpSpecialType`, new Set(["string", "void", "nullable"]));
  assertOptionalAllowedString(value.csharpSourceDeclarationKind, `${path}.csharpSourceDeclarationKind`, new Set(["class", "interface", "enum", "struct"]));
  validateOptionalTargetType(value.csharpBaseType, `${path}.csharpBaseType`, state);
  assertOptionalTrue(value.csharpValueType, `${path}.csharpValueType`);
  validateOptionalTargetType(value.csharpArrayLiteralElementType, `${path}.csharpArrayLiteralElementType`, state);
  validateOptionalTargetType(value.csharpArrayLiteralConstructionType, `${path}.csharpArrayLiteralConstructionType`, state);
  validateOptionalTargetType(value.csharpEnumerableElementType, `${path}.csharpEnumerableElementType`, state);
  validateOptionalTargetType(value.csharpReadOnlyIndexableElementType, `${path}.csharpReadOnlyIndexableElementType`, state);
  validateOptionalTargetType(value.csharpDenseMutableElementType, `${path}.csharpDenseMutableElementType`, state);
  if (value.csharpDelegateSignature !== undefined) {
    const signature = value.csharpDelegateSignature;
    assertExactFields(signature, `${path}.csharpDelegateSignature`, ["parameters", "returnType"]);
    validateTargetTypeArray(signature.parameters, `${path}.csharpDelegateSignature.parameters`, state);
    validateCsharpTargetTypeRef(signature.returnType, `${path}.csharpDelegateSignature.returnType`, state);
  }
  validateOptionalTargetType(value.csharpTaskResultType, `${path}.csharpTaskResultType`, state);
  validateOptionalTargetTypeArray(value.csharpRuntimeUnionArms, `${path}.csharpRuntimeUnionArms`, state);
  if (value.csharpRuntimeUnionObjectShapes !== undefined) {
    validateArray(value.csharpRuntimeUnionObjectShapes, `${path}.csharpRuntimeUnionObjectShapes`, state, (shape, index) => {
      if (shape !== undefined) {
        validateCsharpObjectShape(shape, `${path}.csharpRuntimeUnionObjectShapes[${index}]`, state);
      }
    });
  }
  assertOptionalAllowedString(value.csharpJsSurfaceKind, `${path}.csharpJsSurfaceKind`, new Set(["map", "set", "date", "regexp"]));
  assertOptionalAllowedString(value.csharpCollectionSurface, `${path}.csharpCollectionSurface`, new Set(["record"]));
}

function validateCsharpRenderShape(
  value: CsharpTargetTypeRenderShape,
  path: string,
  state: TargetTypeValidationState,
): void {
  if (!enterValidationObject(value, path, state)) {
    return;
  }
  try {
    switch (value.kind) {
      case "predefined":
        assertExactFields(value, path, ["kind", "name"]);
        assertString(value.name, `${path}.name`);
        break;
      case "nullable":
        assertExactFields(value, path, ["kind"]);
        break;
      case "named":
        assertExactFields(value, path, ["kind", "externAlias", "namespace", "name", "genericArity", "nested"]);
        assertOptionalString(value.externAlias, `${path}.externAlias`);
        assertOptionalStringArray(value.namespace, `${path}.namespace`, state);
        assertString(value.name, `${path}.name`);
        assertOptionalNonNegativeInteger(value.genericArity, `${path}.genericArity`);
        if (value.nested !== undefined) {
          validateArray(value.nested, `${path}.nested`, state, (nested, index) => {
            const nestedPath = `${path}.nested[${index}]`;
            assertExactFields(nested, nestedPath, ["name", "genericArity"]);
            assertString(nested.name, `${nestedPath}.name`);
            assertOptionalNonNegativeInteger(nested.genericArity, `${nestedPath}.genericArity`);
          });
        }
        break;
    }
  } finally {
    leaveValidationObject(value, state);
  }
}

function validateCsharpObjectShape(
  value: CsharpObjectShapeFact,
  path: string,
  state: TargetTypeValidationState,
): void {
  if (!enterValidationObject(value, path, state)) {
    return;
  }
  try {
    assertExactFields(value, path, ["targetType", "members", "implements", "constructible"]);
    validateCsharpTargetTypeRef(value.targetType, `${path}.targetType`, state);
    validateArray(value.members, `${path}.members`, state, (member, index) => {
      const memberPath = `${path}.members[${index}]`;
      assertExactFields(member, memberPath, ["sourceName", "sourceSubjects", "targetName", "memberKind", "type", "optional", "readonly"]);
      assertString(member.sourceName, `${memberPath}.sourceName`);
      if (member.sourceSubjects !== undefined && !Array.isArray(member.sourceSubjects)) {
        throw new Error(`C# target type '${memberPath}.sourceSubjects' must be an array.`);
      }
      assertString(member.targetName, `${memberPath}.targetName`);
      assertAllowedString(member.memberKind, `${memberPath}.memberKind`, new Set(["property", "method"]));
      validateCsharpTargetTypeRef(member.type, `${memberPath}.type`, state);
      assertOptionalBoolean(member.optional, `${memberPath}.optional`);
      assertOptionalBoolean(member.readonly, `${memberPath}.readonly`);
    });
    validateOptionalTargetTypeArray(value.implements, `${path}.implements`, state);
    assertOptionalBoolean(value.constructible, `${path}.constructible`);
  } finally {
    leaveValidationObject(value, state);
  }
}

function validateOptionalTargetType(value: TargetTypeRef | undefined, path: string, state: TargetTypeValidationState): void {
  if (value !== undefined) {
    validateCsharpTargetTypeRef(value, path, state);
  }
}

function validateOptionalTargetTypeArray(
  value: readonly TargetTypeRef[] | undefined,
  path: string,
  state: TargetTypeValidationState,
): void {
  if (value !== undefined) {
    validateTargetTypeArray(value, path, state);
  }
}

function validateTargetTypeArray(value: readonly TargetTypeRef[], path: string, state: TargetTypeValidationState): void {
  validateArray(value, path, state, (entry, index) => validateCsharpTargetTypeRef(entry, `${path}[${index}]`, state));
}

function validateArray<T>(
  value: readonly T[],
  path: string,
  state: TargetTypeValidationState,
  validateEntry: (entry: T, index: number) => void,
): void {
  if (!Array.isArray(value)) {
    throw new Error(`C# target type '${path}' must be an array.`);
  }
  if (!enterValidationObject(value, path, state)) {
    return;
  }
  try {
    value.forEach(validateEntry);
  } finally {
    leaveValidationObject(value, state);
  }
}

function assertExactFields(value: object, path: string, fields: readonly string[]): void {
  const allowed = new Set(fields);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !allowed.has(key)) {
      throw new Error(`C# target type '${path}' contains unsupported field '${String(key)}'.`);
    }
  }
}

function assertString(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string") {
    throw new Error(`C# target type '${path}' must be a string.`);
  }
}

function assertOptionalString(value: unknown, path: string): void {
  if (value !== undefined) {
    assertString(value, path);
  }
}

function assertAllowedString(value: unknown, path: string, allowed: ReadonlySet<string>): void {
  assertString(value, path);
  if (!allowed.has(value)) {
    throw new Error(`C# target type '${path}' has unsupported value '${value}'.`);
  }
}

function assertOptionalAllowedString(value: unknown, path: string, allowed: ReadonlySet<string>): void {
  if (value !== undefined) {
    assertAllowedString(value, path, allowed);
  }
}

function assertOptionalStringArray(
  value: readonly string[] | undefined,
  path: string,
  state: TargetTypeValidationState,
): void {
  if (value !== undefined) {
    validateArray(value, path, state, (entry, index) => assertString(entry, `${path}[${index}]`));
  }
}

function assertOptionalTrue(value: unknown, path: string): void {
  if (value !== undefined && value !== true) {
    throw new Error(`C# target type '${path}' must be true when present.`);
  }
}

function assertOptionalBoolean(value: unknown, path: string): void {
  if (value !== undefined && typeof value !== "boolean") {
    throw new Error(`C# target type '${path}' must be a boolean when present.`);
  }
}

function assertOptionalPositiveInteger(value: unknown, path: string): void {
  if (value !== undefined && (!Number.isSafeInteger(value) || (value as number) <= 0)) {
    throw new Error(`C# target type '${path}' must be a positive safe integer when present.`);
  }
}

function assertOptionalNonNegativeInteger(value: unknown, path: string): void {
  if (value !== undefined && (!Number.isSafeInteger(value) || (value as number) < 0)) {
    throw new Error(`C# target type '${path}' must be a non-negative safe integer when present.`);
  }
}

function enterValidationObject(value: object, path: string, state: TargetTypeValidationState): boolean {
  if (state.completed.has(value)) {
    return false;
  }
  if (state.active.has(value)) {
    throw new Error(`C# target type '${path}' contains a cycle.`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    throw new Error(`C# target type '${path}' contains a non-plain object.`);
  }
  state.active.add(value);
  return true;
}

function leaveValidationObject(value: object, state: TargetTypeValidationState): void {
  state.active.delete(value);
  state.completed.add(value);
}

function snapshotTargetTypeRef(value: TargetTypeRef): TargetTypeRef {
  return snapshotCsharpTargetTypeRef(value);
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
