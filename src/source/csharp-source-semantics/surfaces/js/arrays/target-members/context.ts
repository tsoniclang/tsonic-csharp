import type {
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  csharpEnumerableTargetType,
  csharpListTargetType,
  csharpQualifiedTypeRenderShape,
  csharpReadOnlyListTargetType,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpTargetNamedType,
} from "../../source-library.js";
import {
  csharpJsArrayCarrierTargetType,
} from "../../array-target-type.js";

export interface ArrayTargetMemberContext {
  readonly itemType: TargetTypeRef;
  readonly mappedItemType: TargetTypeRef;
  readonly enumerableType: TargetTypeRef;
  readonly readOnlyListType: TargetTypeRef;
  readonly listType: TargetTypeRef;
  readonly intType: TargetTypeRef;
  readonly doubleType: TargetTypeRef;
  readonly boolType: TargetTypeRef;
  readonly stringType: TargetTypeRef;
  readonly arrayHelpersType: TargetTypeRef;
  readonly arrayType: TargetTypeRef;
}

export function createArrayTargetMemberContext(receiverElementType?: TargetTypeRef): ArrayTargetMemberContext {
  const itemType: TargetTypeRef = receiverElementType ?? { kind: "type-parameter", name: "T" };
  const mappedItemType: TargetTypeRef = { kind: "type-parameter", name: "U" };
  return {
    itemType,
    mappedItemType,
    enumerableType: csharpEnumerableTargetType(itemType),
    readOnlyListType: csharpReadOnlyListTargetType(itemType),
    listType: csharpListTargetType(itemType),
    intType: csharpSourcePrimitiveTargetType("int32"),
    doubleType: csharpSourcePrimitiveTargetType("float64"),
    boolType: csharpSourcePrimitiveTargetType("bool"),
    stringType: csharpStringTargetType(),
    arrayHelpersType: csharpTargetNamedType("Tsonic.CSharp.Js.Array", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "Array")),
    arrayType: csharpJsArrayCarrierTargetType(itemType),
  };
}
