import type { CsharpNativeGenericTypeDefinition, TargetTypeRef } from "../native-type-data.js";
import type { CsharpObjectShapeFact, CsharpTargetNamedTypeRef, CsharpRuntimeUnionTargetTypeRef } from "../model.js";
import { csharpQualifiedTypeRenderShape } from "../render-shapes.js";
import { csharpTargetNamedType } from "../factories.js";
import { csharpNullableReferenceTargetType, getCsharpNullableElementTargetType } from "./nullable.js";
import { getCsharpGenericOptionalParts } from "../projections.js";
import { applyCsharpNativeGenericType } from "../native-generics.js";

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
  definition: CsharpNativeGenericTypeDefinition,
): CsharpTargetNamedTypeRef {
  return applyCsharpNativeGenericType(definition, [pointee]);
}

export function csharpRuntimeRecordFieldTargetType(pointee: TargetTypeRef, definition: CsharpNativeGenericTypeDefinition): CsharpTargetNamedTypeRef {
  return applyCsharpNativeGenericType(definition, [pointee]);
}

export function csharpRuntimeRawPointerTargetType(definition: CsharpNativeGenericTypeDefinition): CsharpTargetNamedTypeRef {
  return applyCsharpNativeGenericType(definition, []);
}

export function csharpRuntimeNativeLayoutTargetType(pointee: TargetTypeRef, definition: CsharpNativeGenericTypeDefinition): CsharpTargetNamedTypeRef {
  return applyCsharpNativeGenericType(definition, [pointee]);
}

export function csharpRuntimeNativeArrayTargetType(pointee: TargetTypeRef, definition: CsharpNativeGenericTypeDefinition): CsharpTargetNamedTypeRef {
  return applyCsharpNativeGenericType(definition, [pointee]);
}

export function csharpRuntimeLocationPointee(
  type: TargetTypeRef | undefined,
  definition: CsharpNativeGenericTypeDefinition,
): TargetTypeRef | undefined {
  return type?.kind === "target-named" &&
      type.id === definition.carrier.id && definition.parameters.length === 1 &&
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
    type.csharpRuntimeUnionSemantics === "native-ordered" &&
    Array.isArray(arms) &&
    arms.length >= 2 &&
    arms.length <= 8;
}

export function getCsharpRuntimeUnionArms(
  type: TargetTypeRef | undefined,
): readonly TargetTypeRef[] | undefined {
  const optional = getCsharpGenericOptionalParts(type);
  if (optional !== undefined) return [csharpAbsenceTargetType(), optional.element];
  return isCsharpRuntimeUnionTargetType(type)
    ? type.csharpRuntimeUnionArms
    : undefined;
}

