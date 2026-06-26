import type {
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  csharpQualifiedTypeRenderShape,
  csharpTargetNamedType,
} from "../source-library.js";
import type {
  CsharpJsMapTargetTypeRef,
  CsharpJsSetTargetTypeRef,
} from "./types.js";

const csharpJsMapTypeId = "Tsonic.CSharp.Js.Map`2";
const csharpJsSetTypeId = "Tsonic.CSharp.Js.Set`1";

export function csharpJsMapTargetType(keyType: TargetTypeRef, valueType: TargetTypeRef): CsharpJsMapTargetTypeRef {
  const iterableElementType: TargetTypeRef = { kind: "tuple", elements: [keyType, valueType] };
  return {
    ...csharpTargetNamedType(
      csharpJsMapTypeId,
      [keyType, valueType],
      csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "Map"),
      { enumerableElementType: iterableElementType },
    ),
    csharpJsSurfaceKind: "map",
  } satisfies CsharpJsMapTargetTypeRef;
}

export function csharpJsSetTargetType(elementType: TargetTypeRef): CsharpJsSetTargetTypeRef {
  return {
    ...csharpTargetNamedType(
      csharpJsSetTypeId,
      [elementType],
      csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "Set"),
      { enumerableElementType: elementType },
    ),
    csharpJsSurfaceKind: "set",
  } satisfies CsharpJsSetTargetTypeRef;
}

export function isCsharpJsMapTargetType(type: TargetTypeRef | undefined): type is CsharpJsMapTargetTypeRef {
  return type?.kind === "target-named" && type.id === csharpJsMapTypeId;
}

export function isCsharpJsSetTargetType(type: TargetTypeRef | undefined): type is CsharpJsSetTargetTypeRef {
  return type?.kind === "target-named" && type.id === csharpJsSetTypeId;
}
