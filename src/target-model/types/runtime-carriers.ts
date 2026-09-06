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
} from "./nullable.js";

export function csharpAnyTargetType(): CsharpTargetNamedTypeRef {
  return csharpTsValueTargetType();
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

export function csharpRuntimeNullTargetType(): TargetTypeRef {
  return csharpTargetNamedType("Tsonic.CSharp.Runtime.Null", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Runtime", "Null"));
}

export function csharpRuntimeUndefinedTargetType(): TargetTypeRef {
  return csharpTargetNamedType("Tsonic.CSharp.Runtime.Undefined", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Runtime", "Undefined"));
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
      !isCsharpRuntimeNullTargetType(member) &&
      !isCsharpRuntimeUndefinedTargetType(member),
  );
  const nullishMembers = canonicalMembers.filter(
    (member) =>
      isCsharpRuntimeNullTargetType(member) ||
      isCsharpRuntimeUndefinedTargetType(member),
  );
  if (nonNullishMembers.length === 0) {
    return nullishMembers.length === 1
      ? nullishMembers[0]
      : csharpRuntimeUnionTargetType(nullishMembers);
  }
  if (nullishMembers.length === 0) {
    return nonNullishMembers.length === 1
      ? nonNullishMembers[0]
      : csharpRuntimeUnionTargetType(nonNullishMembers);
  }
  return nonNullishMembers.length === 1
    ? csharpNullableTargetType(nonNullishMembers[0]!)
    : csharpRuntimeUnionTargetType([
        ...nonNullishMembers,
        ...nullishMembers,
      ]);
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

export function isCsharpRuntimeNullTargetType(type: TargetTypeRef | undefined): boolean {
  return type?.kind === "target-named" && type.id === "Tsonic.CSharp.Runtime.Null";
}

export function isCsharpRuntimeUndefinedTargetType(type: TargetTypeRef | undefined): boolean {
  return type?.kind === "target-named" && type.id === "Tsonic.CSharp.Runtime.Undefined";
}

export function isCsharpRuntimeUnionTargetType(type: TargetTypeRef | undefined): type is CsharpRuntimeUnionTargetTypeRef {
  const arms = (type as Partial<CsharpRuntimeUnionTargetTypeRef> | undefined)?.csharpRuntimeUnionArms;
  return type?.kind === "target-named" &&
    Array.isArray(arms) &&
    arms.length >= 2 &&
    arms.length <= 8;
}

export function getCsharpRuntimeUnionArms(type: TargetTypeRef | undefined): readonly TargetTypeRef[] | undefined {
  return isCsharpRuntimeUnionTargetType(type)
    ? type.csharpRuntimeUnionArms
    : undefined;
}
