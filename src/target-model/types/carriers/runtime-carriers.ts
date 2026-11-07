import type { CsharpObjectShapeFact, CsharpTargetNamedTypeRef, TargetTypeRef, CsharpRuntimeUnionTargetTypeRef } from "../model.js";
import { csharpQualifiedTypeRenderShape } from "../render-shapes.js";
import { csharpTargetNamedType } from "../factories.js";
import { targetTypeRefEquals } from "../equality.js";
import { csharpNullableReferenceTargetType, getCsharpNullableElementTargetType } from "./nullable.js";
import { getCsharpGenericOptionalParts } from "../projections.js";
import { emptyCsharpTypeDefinitions, type CsharpTypeDefinitions } from "../source-union-definitions.js";

export function csharpAnyTargetType(): CsharpTargetNamedTypeRef {
  return csharpTsValueTargetType();
}

export function csharpEmptyObjectTargetType(): CsharpTargetNamedTypeRef {
  return csharpTargetNamedType("Tsonic.CSharp.Runtime.EmptyObject", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Runtime", "EmptyObject"), { allowsRefLikeTypeArguments: [], typeofRuntimeKind: "object" });
}

export function isCsharpEmptyObjectTargetType(type: TargetTypeRef): boolean {
  return type.kind === "target-named" && type.id === "Tsonic.CSharp.Runtime.EmptyObject" &&
    (type.typeArguments?.length ?? 0) === 0;
}

export function csharpTsValueTargetType(): CsharpTargetNamedTypeRef {
  return csharpTargetNamedType("Tsonic.CSharp.Runtime.TsValue", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Runtime", "TsValue"), { allowsRefLikeTypeArguments: [],
      valueType: true,
      absorbsNullish: true,
      jsValueCarrier: true,
    });
}

export function csharpTsUnionTargetType(): TargetTypeRef {
  return csharpTargetNamedType("Tsonic.CSharp.Runtime.TsUnion", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Runtime", "TsUnion"), { allowsRefLikeTypeArguments: [],});
}

export function csharpTsThrownValueExceptionTargetType(): TargetTypeRef {
  return csharpTargetNamedType("Tsonic.CSharp.Runtime.TsThrownValueException", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Runtime", "TsThrownValueException"), { allowsRefLikeTypeArguments: [],
    throwable: true,
    typeofRuntimeKind: "object",
  });
}

export function csharpAbsenceTargetType(): TargetTypeRef {
  return csharpNullableReferenceTargetType(csharpTargetNamedType("csharp.native.absence", undefined, { kind: "predefined", name: "object" }, { allowsRefLikeTypeArguments: [], absorbsNullish: true }));
}

export function csharpRuntimeLocationTargetType(
  pointee: TargetTypeRef,
): CsharpTargetNamedTypeRef {
  return csharpTargetNamedType("Tsonic.CSharp.Runtime.Location`1", [pointee], csharpQualifiedTypeRenderShape("Tsonic.CSharp.Runtime", "Location"), { allowsRefLikeTypeArguments: [false],});
}

export function csharpRuntimeRecordFieldTargetType(pointee: TargetTypeRef): CsharpTargetNamedTypeRef {
  return csharpTargetNamedType("Tsonic.CSharp.Runtime.RecordField`1", [pointee], csharpQualifiedTypeRenderShape("Tsonic.CSharp.Runtime", "RecordField"), { allowsRefLikeTypeArguments: [false], valueType: true });
}

export function csharpRuntimeRawPointerTargetType(): CsharpTargetNamedTypeRef {
  return csharpTargetNamedType("Tsonic.CSharp.Runtime.RawPointer", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Runtime", "RawPointer"), { allowsRefLikeTypeArguments: [],});
}

export function csharpRuntimeNativeLayoutTargetType(pointee: TargetTypeRef): CsharpTargetNamedTypeRef {
  return csharpTargetNamedType("Tsonic.CSharp.Runtime.NativeLayout`1", [pointee], csharpQualifiedTypeRenderShape("Tsonic.CSharp.Runtime", "NativeLayout"), { allowsRefLikeTypeArguments: [false],});
}

export function csharpRuntimeNativeArrayTargetType(pointee: TargetTypeRef): CsharpTargetNamedTypeRef {
  return csharpTargetNamedType("Tsonic.CSharp.Runtime.NativeArray`1", [pointee], csharpQualifiedTypeRenderShape("Tsonic.CSharp.Runtime", "NativeArray"), { allowsRefLikeTypeArguments: [false],});
}

export function csharpRuntimeLocationPointee(
  type: TargetTypeRef | undefined,
): TargetTypeRef | undefined {
  return type?.kind === "target-named" &&
      type.id === "Tsonic.CSharp.Runtime.Location`1" &&
      type.typeArguments?.length === 1
    ? type.typeArguments[0]
    : undefined;
}

export function csharpRuntimeUnionTargetType(
  arms: readonly TargetTypeRef[],
  objectShapes?: readonly (CsharpObjectShapeFact | undefined)[],
): CsharpRuntimeUnionTargetTypeRef | undefined {
  if (arms.length < 2 || arms.length > 8) {
    return undefined;
  }
  const targetType = csharpTargetNamedType(`Tsonic.CSharp.Runtime.Union\`${arms.length}`, arms, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Runtime", "Union"), { allowsRefLikeTypeArguments: arms.map(() => false) });
  return {
    kind: "target-named",
    id: targetType.id,
    csharpAllowsRefLikeTypeArguments: targetType.csharpAllowsRefLikeTypeArguments,
    typeArguments: arms,
    ...(targetType.csharpRender !== undefined ? { csharpRender: targetType.csharpRender } : {}),
    csharpRuntimeUnionArms: arms,
    csharpRuntimeUnionSemantics: "native-ordered",
    csharpValueType: true,
    ...(objectShapes === undefined || objectShapes.every((objectShape) => objectShape === undefined) ? {} : { csharpRuntimeUnionObjectShapes: objectShapes }),
  } satisfies CsharpRuntimeUnionTargetTypeRef;
}

/**
 * Q73 coincident roles: the storage of one Host closed sum's present arms. Arms whose .NET carriers are equal share ONE
 * storage arm (the first occurrence, Host order kept, C-2459); every Host arm and role is kept and points to its storage
 * arm. Storage cardinality is separate from role cardinality: `string[] | readonly string[]` has two Host arms (two
 * roles) and one storage arm `JSArray<string>`, as at baseline. This is a .NET layout fact, never a Source decision:
 * the Host still chooses the arm; C# only places it.
 */
export interface CsharpSourceSumStorage {
  /** Distinct present carriers in first-occurrence Host order. */
  readonly storage: readonly TargetTypeRef[];
  /** Per present Host arm (in Host order): its storage arm position. */
  readonly slots: readonly number[];
}

export function csharpSourceSumStorage(present: readonly TargetTypeRef[]): CsharpSourceSumStorage {
  const storage: TargetTypeRef[] = [];
  const slots: number[] = [];
  for (const carrier of present) {
    let slot = storage.findIndex(existing => targetTypeRefEquals(existing, carrier));
    if (slot < 0) {
      slot = storage.length;
      storage.push(carrier);
    }
    slots.push(slot);
  }
  return Object.freeze({ storage: Object.freeze(storage), slots: Object.freeze(slots) });
}

/**
 * The CLR union for one Host closed sum whose present arms are concrete: `Union<S1..Sk>` over the DISTINCT storage
 * arms (csharpSourceSumStorage), in Host order (R6: no sort, no flattening). `slots` maps each present Host arm to its
 * storage arm; it is the only way an arm position becomes a payload slot. Absence is lifted by the caller.
 */
export function csharpSourceSumTargetType(storage: readonly TargetTypeRef[],
  slots: readonly number[] = storage.map((_, index) => index),
  /** Q86: the Host key category of each present Host arm (facts.profile.keyCategories), when the Host publishes them. */
  keyCategories?: readonly string[]): CsharpRuntimeUnionTargetTypeRef | undefined {
  if (storage.some((arm, index) => storage.slice(0, index).some(earlier => targetTypeRefEquals(earlier, arm))) ||
    slots.some(slot => !Number.isInteger(slot) || slot < 0 || slot >= storage.length) ||
    storage.some((_, index) => !slots.includes(index))) {
    throw new TypeError("A source-sum carrier takes distinct storage arms and a slot for every present Host arm.");
  }
  const union = csharpRuntimeUnionTargetType(storage);
  return union === undefined ? undefined
    : { ...union, csharpRuntimeUnionSemantics: "source-sum" as const, csharpSourceSumSlots: Object.freeze([...slots]),
      ...(keyCategories === undefined ? {} : { csharpSourceSumKeyCategories: Object.freeze([...keyCategories]) }) };
}

/**
 * The storage position of present Host arm `presentIndex` in a source-sum carrier. undefined for a carrier that is not a
 * source-sum union (one storage arm: the whole value is the payload).
 */
export function csharpSourceSumStorageSlot(carrier: TargetTypeRef, presentIndex: number): number | undefined {
  if (!isCsharpRuntimeUnionTargetType(carrier) || carrier.csharpRuntimeUnionSemantics !== "source-sum") return undefined;
  const slot = carrier.csharpSourceSumSlots?.[presentIndex];
  if (slot === undefined) throw new TypeError("A source-sum carrier has no storage slot for this present Host arm.");
  return slot;
}

export function isCsharpJsValueTargetType(
  type: TargetTypeRef | undefined,
): boolean {
  return type?.kind === "target-named" &&
    (type as CsharpTargetNamedTypeRef).csharpJsValueCarrier === true;
}

export function isCsharpClosedJsonRuntimeLeaf(
  type: TargetTypeRef | undefined,
): boolean {
  return isCsharpJsValueTargetType(type) ||
    type?.kind === "target-named" &&
      type.id === "Tsonic.CSharp.Js.JSObject";
}

export function isCsharpClosedJsRuntimeCarrier(type: TargetTypeRef | undefined): boolean {
  return isCsharpJsValueTargetType(type) ||
    type?.kind === "target-named" &&
    (
      type.id === "Tsonic.CSharp.Runtime.TsObject" ||
      type.id === "Tsonic.CSharp.Runtime.TsArray" ||
      type.id === "Tsonic.CSharp.Runtime.TsUnion" ||
      type.id === "Tsonic.CSharp.Runtime.TsFunction"
    );
}

export function isCsharpAbsenceTargetType(type: TargetTypeRef | undefined): boolean {
  return type?.kind === "target-named" && type.id === "csharp.native.absence";
}

export function csharpCarrierAdmitsSourceAbsence(type: TargetTypeRef | undefined): boolean {
  return isCsharpAbsenceTargetType(type) || isCsharpJsValueTargetType(type) ||
    getCsharpNullableElementTargetType(type) !== undefined || getCsharpGenericOptionalParts(type) !== undefined;
}

export function isCsharpRuntimeUnionTargetType(type: TargetTypeRef | undefined): type is CsharpRuntimeUnionTargetTypeRef {
  const arms = (type as Partial<CsharpRuntimeUnionTargetTypeRef> | undefined)?.csharpRuntimeUnionArms;
  return type?.kind === "target-named" &&
    (type.csharpRuntimeUnionSemantics === "native-ordered" || type.csharpRuntimeUnionSemantics === "source-sum") &&
    Array.isArray(arms) &&
    arms.length >= 2 &&
    arms.length <= 8;
}

export function getCsharpRuntimeUnionArms(
  type: TargetTypeRef | undefined, definitions: CsharpTypeDefinitions = emptyCsharpTypeDefinitions,
): readonly TargetTypeRef[] | undefined {
  const optional = getCsharpGenericOptionalParts(type);
  if (optional !== undefined) return [csharpAbsenceTargetType(), optional.element];
  return isCsharpRuntimeUnionTargetType(type)
    ? type.csharpRuntimeUnionArms
    : type === undefined ? undefined : definitions.sourceUnionArms(type);
}

