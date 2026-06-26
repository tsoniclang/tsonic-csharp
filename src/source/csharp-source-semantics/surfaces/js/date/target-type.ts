import type {
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  type CsharpTargetNamedTypeRef,
  csharpQualifiedTypeRenderShape,
  csharpTargetNamedType,
} from "../source-library.js";

const csharpJsDateTypeId = "Tsonic.CSharp.Js.Date";

type CsharpJsDateTargetTypeRef = CsharpTargetNamedTypeRef & {
  readonly csharpJsSurfaceKind: "date";
};

export function csharpJsDateTargetType(): CsharpJsDateTargetTypeRef {
  return {
    ...csharpTargetNamedType(csharpJsDateTypeId, undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "Date")),
    csharpJsSurfaceKind: "date",
  } satisfies CsharpJsDateTargetTypeRef;
}

export function isCsharpJsDateRuntimeCarrier(type: TargetTypeRef | undefined): type is CsharpJsDateTargetTypeRef {
  return type?.kind === "target-named" && (type as CsharpJsDateTargetTypeRef).csharpJsSurfaceKind === "date";
}
