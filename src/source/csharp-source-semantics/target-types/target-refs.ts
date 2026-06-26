import type {
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  CsharpTypeofRuntimeKind,
} from "../../csharp-facts.js";
import type {
  CsharpTargetNamedTypeRef,
  CsharpTargetTypeRenderShape,
} from "./definitions.js";

export function csharpTargetNamedType(
  id: string,
  typeArguments?: readonly TargetTypeRef[],
  renderShape?: CsharpTargetTypeRenderShape,
  metadata: {
    readonly arrayLiteralElementType?: TargetTypeRef;
    readonly enumerableElementType?: TargetTypeRef;
    readonly readOnlyIndexableElementType?: TargetTypeRef;
    readonly denseMutableElementType?: TargetTypeRef;
    readonly specialType?: CsharpTargetNamedTypeRef["csharpSpecialType"];
    readonly sourceDeclarationKind?: CsharpTargetNamedTypeRef["csharpSourceDeclarationKind"];
    readonly throwable?: true;
    readonly typeofRuntimeKind?: CsharpTypeofRuntimeKind;
    readonly valueType?: true;
  } = {},
): CsharpTargetNamedTypeRef {
  return {
    kind: "target-named",
    id,
    ...(typeArguments !== undefined && typeArguments.length > 0 ? { typeArguments } : {}),
    ...(renderShape !== undefined ? { csharpRender: renderShape } : {}),
    ...(metadata.arrayLiteralElementType !== undefined ? { csharpArrayLiteralElementType: metadata.arrayLiteralElementType } : {}),
    ...(metadata.enumerableElementType !== undefined ? { csharpEnumerableElementType: metadata.enumerableElementType } : {}),
    ...(metadata.readOnlyIndexableElementType !== undefined ? { csharpReadOnlyIndexableElementType: metadata.readOnlyIndexableElementType } : {}),
    ...(metadata.denseMutableElementType !== undefined ? { csharpDenseMutableElementType: metadata.denseMutableElementType } : {}),
    ...(metadata.specialType !== undefined ? { csharpSpecialType: metadata.specialType } : {}),
    ...(metadata.sourceDeclarationKind !== undefined ? { csharpSourceDeclarationKind: metadata.sourceDeclarationKind } : {}),
    ...(metadata.throwable === true ? { csharpThrowable: true } : {}),
    ...(metadata.typeofRuntimeKind !== undefined ? { csharpTypeofRuntimeKind: metadata.typeofRuntimeKind } : {}),
    ...(metadata.valueType === true ? { csharpValueType: true } : {}),
  } satisfies CsharpTargetNamedTypeRef;
}
