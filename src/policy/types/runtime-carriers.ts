import type {
  CsharpObjectShapeFact,
  CsharpTargetNamedTypeRef,
  TargetTypeRef,
} from "./definitions.js";
import type {
  TargetTypescriptCompatibilityMode,
} from "@tsonic/target-api";
import type {
  CsharpRuntimeUnionTargetTypeRef,
} from "./definitions.js";
import {
  csharpQualifiedTypeRenderShape,
} from "./render-shapes.js";
import {
  csharpTargetNamedType,
} from "./target-refs.js";
import {
  targetTypeRefKey,
} from "./equality.js";
import {
  csharpNullableTargetType,
} from "./nullable.js";

export function csharpAnyTargetType(
  mode: TargetTypescriptCompatibilityMode,
): TargetTypeRef {
  return mode === "compat"
    ? csharpCompatAnyTargetType()
    : { kind: "opaque", id: "any" };
}

export function csharpCompatAnyTargetType(): CsharpTargetNamedTypeRef {
  return csharpTargetNamedType(
    "tsonic.csharp.compat:any",
    undefined,
    csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "TsValue"),
    {
      valueType: true,
      absorbsNullish: true,
      compatValueCarrier: true,
    },
  );
}

export function csharpTsValueTargetType(): CsharpTargetNamedTypeRef {
  return csharpTargetNamedType(
    "Tsonic.CSharp.Js.TsValue",
    undefined,
    csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "TsValue"),
    {
      valueType: true,
      absorbsNullish: true,
      compatValueCarrier: true,
    },
  );
}

export function csharpTsUnionTargetType(): TargetTypeRef {
  return csharpTargetNamedType("Tsonic.CSharp.Js.TsUnion", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "TsUnion"));
}

export function csharpTsThrownValueExceptionTargetType(): TargetTypeRef {
  return csharpTargetNamedType("Tsonic.CSharp.Js.TsThrownValueException", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "TsThrownValueException"), {
    throwable: true,
  });
}

export function csharpRuntimeNullTargetType(): TargetTypeRef {
  return csharpTargetNamedType("Tsonic.CSharp.Runtime.Null", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Runtime", "Null"));
}

export function csharpRuntimeUndefinedTargetType(): TargetTypeRef {
  return csharpTargetNamedType("Tsonic.CSharp.Runtime.Undefined", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Runtime", "Undefined"));
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
  const canonicalMembers = [...byIdentity.values()];
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

export function isCsharpAnyRuntimeCarrier(type: TargetTypeRef | undefined): boolean {
  return type !== undefined &&
    (
      type.kind === "opaque" && type.id === "any" ||
      type.kind === "target-named" && type.id === "tsonic.csharp.compat:any"
    );
}

export function isCsharpCompatValueTargetType(
  type: TargetTypeRef | undefined,
): boolean {
  return type?.kind === "target-named" &&
    (type as CsharpTargetNamedTypeRef).csharpCompatValueCarrier === true;
}

export function isCsharpClosedJsonRuntimeLeaf(
  type: TargetTypeRef | undefined,
): boolean {
  return isCsharpCompatValueTargetType(type) ||
    type?.kind === "target-named" &&
      type.id === "Tsonic.CSharp.Js.JSObject";
}

export function isCsharpClosedCompatRuntimeCarrier(type: TargetTypeRef | undefined): boolean {
  return isCsharpCompatValueTargetType(type) ||
    type?.kind === "target-named" &&
    (
      type.id === "Tsonic.CSharp.Js.TsObject" ||
      type.id === "Tsonic.CSharp.Js.TsArray" ||
      type.id === "Tsonic.CSharp.Js.TsUnion" ||
      type.id === "Tsonic.CSharp.Js.TsFunction"
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
