import type {
  CsharpObjectShapeFact,
  CsharpTargetNamedTypeRef,
  TargetTypeRef,
} from "./model.js";
import type {
  CsharpRuntimeUnionTargetTypeRef,
} from "./model.js";
import {
  csharpQualifiedTypeRenderShape,
} from "./render-shapes.js";
import {
  csharpTargetNamedType,
} from "./factories.js";
import {
  targetTypeRefKey,
} from "./equality.js";
import {
  csharpNullableTargetType,
  csharpNullableReferenceTargetType,
} from "./nullable.js";
import { csharpOptionalStorageProjection, getCsharpGenericOptionalParts } from "./projections.js";

export function csharpAnyTargetType(): CsharpTargetNamedTypeRef {
  return csharpTsValueTargetType();
}

export function csharpEmptyObjectTargetType(): CsharpTargetNamedTypeRef {
  return csharpTargetNamedType("Tsonic.CSharp.Runtime.EmptyObject", undefined,
    csharpQualifiedTypeRenderShape("Tsonic.CSharp.Runtime", "EmptyObject"));
}

export function isCsharpEmptyObjectTargetType(type: TargetTypeRef): boolean {
  return type.kind === "target-named" && type.id === "Tsonic.CSharp.Runtime.EmptyObject" &&
    (type.typeArguments?.length ?? 0) === 0;
}

export function csharpTsValueTargetType(): CsharpTargetNamedTypeRef {
  return csharpTargetNamedType(
    "Tsonic.CSharp.Runtime.TsValue",
    undefined,
    csharpQualifiedTypeRenderShape("Tsonic.CSharp.Runtime", "TsValue"),
    {
      valueType: true,
      absorbsNullish: true,
      jsValueCarrier: true,
    },
  );
}

export function csharpTsUnionTargetType(): TargetTypeRef {
  return csharpTargetNamedType("Tsonic.CSharp.Runtime.TsUnion", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Runtime", "TsUnion"));
}

export function csharpTsThrownValueExceptionTargetType(): TargetTypeRef {
  return csharpTargetNamedType("Tsonic.CSharp.Runtime.TsThrownValueException", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Runtime", "TsThrownValueException"), {
    throwable: true,
  });
}

export function csharpAbsenceTargetType(): TargetTypeRef {
  return csharpNullableReferenceTargetType(csharpTargetNamedType(
    "csharp.native.absence", undefined, { kind: "predefined", name: "object" },
    { absorbsNullish: true },
  ));
}

export function csharpRuntimeLocationTargetType(
  pointee: TargetTypeRef,
): CsharpTargetNamedTypeRef {
  return csharpTargetNamedType(
    "Tsonic.CSharp.Runtime.Location`1",
    [pointee],
    csharpQualifiedTypeRenderShape("Tsonic.CSharp.Runtime", "Location"),
  );
}

export function csharpRuntimeRecordFieldTargetType(pointee: TargetTypeRef): CsharpTargetNamedTypeRef {
  return csharpTargetNamedType("Tsonic.CSharp.Runtime.RecordField`1", [pointee],
    csharpQualifiedTypeRenderShape("Tsonic.CSharp.Runtime", "RecordField"), { valueType: true });
}

export function csharpRuntimeRawPointerTargetType(): CsharpTargetNamedTypeRef {
  return csharpTargetNamedType(
    "Tsonic.CSharp.Runtime.RawPointer",
    undefined,
    csharpQualifiedTypeRenderShape("Tsonic.CSharp.Runtime", "RawPointer"),
  );
}

export function csharpRuntimeNativeLocationTargetType(): CsharpTargetNamedTypeRef {
  return csharpTargetNamedType("Tsonic.CSharp.Runtime.NativeLocation", undefined,
    csharpQualifiedTypeRenderShape("Tsonic.CSharp.Runtime", "NativeLocation"));
}

export function csharpRuntimeNativeLayoutTargetType(pointee?: TargetTypeRef): CsharpTargetNamedTypeRef {
  return csharpTargetNamedType(pointee === undefined ? "Tsonic.CSharp.Runtime.NativeLayout" : "Tsonic.CSharp.Runtime.NativeLayout`1",
    pointee === undefined ? undefined : [pointee], csharpQualifiedTypeRenderShape("Tsonic.CSharp.Runtime", "NativeLayout"));
}

export function csharpRuntimeNativeArrayTargetType(pointee: TargetTypeRef): CsharpTargetNamedTypeRef {
  return csharpTargetNamedType("Tsonic.CSharp.Runtime.NativeArray`1", [pointee],
    csharpQualifiedTypeRenderShape("Tsonic.CSharp.Runtime", "NativeArray"));
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
  const targetType = csharpTargetNamedType(
    `Tsonic.CSharp.Runtime.Union\`${arms.length}`,
    arms,
    csharpQualifiedTypeRenderShape("Tsonic.CSharp.Runtime", "Union"),
  );
  return {
    kind: "target-named",
    id: targetType.id,
    typeArguments: arms,
    ...(targetType.csharpRender !== undefined ? { csharpRender: targetType.csharpRender } : {}),
    csharpRuntimeUnionArms: arms,
    csharpValueType: true,
    ...(objectShapes === undefined || objectShapes.every((objectShape) => objectShape === undefined) ? {} : { csharpRuntimeUnionObjectShapes: objectShapes }),
  } satisfies CsharpRuntimeUnionTargetTypeRef;
}

export function combineCsharpTargetUnionMembers(
  members: readonly TargetTypeRef[],
): TargetTypeRef | undefined {
  const byIdentity = new Map<string, TargetTypeRef>();
  for (const member of members) {
    byIdentity.set(targetTypeRefKey(member), member);
  }
  const canonicalMembers = [...byIdentity.values()].sort((left, right) =>
    targetTypeRefKey(left).localeCompare(targetTypeRefKey(right)));
  const nonNullishMembers = canonicalMembers.filter(
    (member) =>
      !isCsharpAbsenceTargetType(member),
  );
  const nullishMembers = canonicalMembers.filter(
    (member) =>
      isCsharpAbsenceTargetType(member),
  );
  if (nonNullishMembers.length === 0) {
    return nullishMembers[0];
  }
  if (nullishMembers.length === 0) {
    return nonNullishMembers.length === 1
      ? nonNullishMembers[0]
      : csharpRuntimeUnionTargetType(nonNullishMembers);
  }
  if (nonNullishMembers.length === 1 && nonNullishMembers[0]!.kind === "type-parameter") {
    return csharpOptionalStorageProjection(nonNullishMembers[0]!);
  }
  const value = nonNullishMembers.length === 1
    ? nonNullishMembers[0]
    : csharpRuntimeUnionTargetType(nonNullishMembers);
  return value === undefined ? undefined : csharpNullableTargetType(value);
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

export function isCsharpRuntimeUnionTargetType(type: TargetTypeRef | undefined): type is CsharpRuntimeUnionTargetTypeRef {
  const arms = (type as Partial<CsharpRuntimeUnionTargetTypeRef> | undefined)?.csharpRuntimeUnionArms;
  return type?.kind === "target-named" &&
    Array.isArray(arms) &&
    arms.length >= 2 &&
    arms.length <= 8;
}

export function getCsharpRuntimeUnionArms(type: TargetTypeRef | undefined): readonly TargetTypeRef[] | undefined {
  const optional = getCsharpGenericOptionalParts(type);
  if (optional !== undefined) return [csharpAbsenceTargetType(), optional.element];
  return isCsharpRuntimeUnionTargetType(type)
    ? type.csharpRuntimeUnionArms
    : undefined;
}

export { getCsharpGenericOptionalParts } from "./projections.js";
