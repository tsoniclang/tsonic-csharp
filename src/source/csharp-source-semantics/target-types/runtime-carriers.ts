import type {
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  CsharpRuntimeUnionTargetTypeRef,
} from "./definitions.js";
import {
  csharpQualifiedTypeRenderShape,
} from "./render-shapes.js";
import {
  csharpTargetNamedType,
} from "./target-refs.js";

export function csharpAnyRuntimeCarrier(): TargetTypeRef {
  return { kind: "opaque", id: "any" };
}

export function csharpTsValueTargetType(): TargetTypeRef {
  return csharpTargetNamedType("Tsonic.CSharp.Js.TsValue", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "TsValue"));
}

export function csharpTsUnionTargetType(): TargetTypeRef {
  return csharpTargetNamedType("Tsonic.CSharp.Js.TsUnion", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "TsUnion"));
}

export function csharpTsThrownValueExceptionTargetType(): TargetTypeRef {
  return csharpTargetNamedType("Tsonic.CSharp.Js.TsThrownValueException", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "TsThrownValueException"), {
    throwable: true,
  });
}

export function csharpRuntimeUnionTargetType(arms: readonly TargetTypeRef[]): CsharpRuntimeUnionTargetTypeRef | undefined {
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
  } satisfies CsharpRuntimeUnionTargetTypeRef;
}

export function isCsharpAnyRuntimeCarrier(type: TargetTypeRef | undefined): boolean {
  return type?.kind === "opaque" && type.id === "any";
}

export function isCsharpTsValueTargetType(type: TargetTypeRef | undefined): boolean {
  return type?.kind === "target-named" && type.id === "Tsonic.CSharp.Js.TsValue";
}

export function isCsharpClosedCompatRuntimeCarrier(type: TargetTypeRef | undefined): boolean {
  return type?.kind === "target-named" &&
    (
      type.id === "Tsonic.CSharp.Js.TsValue" ||
      type.id === "Tsonic.CSharp.Js.TsObject" ||
      type.id === "Tsonic.CSharp.Js.TsArray" ||
      type.id === "Tsonic.CSharp.Js.TsUnion" ||
      type.id === "Tsonic.CSharp.Js.TsFunction"
    );
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
