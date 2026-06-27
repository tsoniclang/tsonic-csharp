import type {
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  type CsharpTargetNamedTypeRef,
  csharpQualifiedTypeRenderShape,
  csharpTargetNamedType,
} from "../source-library.js";

const csharpJsRegExpTypeId = "Tsonic.CSharp.Js.RegExp";

type CsharpJsRegExpTargetTypeRef = CsharpTargetNamedTypeRef & {
  readonly csharpJsSurfaceKind: "regexp";
};

export function csharpJsRegExpTargetType(): CsharpJsRegExpTargetTypeRef {
  return {
    ...csharpTargetNamedType(csharpJsRegExpTypeId, undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "RegExp")),
    csharpJsSurfaceKind: "regexp",
  } satisfies CsharpJsRegExpTargetTypeRef;
}

export function isCsharpJsRegExpRuntimeCarrier(type: TargetTypeRef | undefined): type is CsharpJsRegExpTargetTypeRef {
  return type?.kind === "target-named" && (type as CsharpJsRegExpTargetTypeRef).csharpJsSurfaceKind === "regexp";
}
