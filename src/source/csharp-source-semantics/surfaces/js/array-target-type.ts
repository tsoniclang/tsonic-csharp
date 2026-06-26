import type {
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  csharpQualifiedTypeRenderShape,
  csharpTargetNamedType,
} from "./source-library.js";

export const csharpJsArrayCarrierId = "Tsonic.CSharp.Js.JSArray`1";

export function csharpJsArrayCarrierTargetType(element: TargetTypeRef): TargetTypeRef {
  return csharpTargetNamedType(
    csharpJsArrayCarrierId,
    [element],
    csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "JSArray"),
    { arrayLiteralElementType: element },
  );
}

export function isCsharpJsArrayCarrierTargetType(type: TargetTypeRef | undefined): boolean {
  return type?.kind === "target-named" && type.id === csharpJsArrayCarrierId;
}

export function getCsharpJsArrayCarrierElementType(type: TargetTypeRef | undefined): TargetTypeRef | undefined {
  return isCsharpJsArrayCarrierTargetType(type) && type?.kind === "target-named"
    ? type.typeArguments?.[0]
    : undefined;
}
