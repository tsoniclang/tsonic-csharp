import type {
  TargetTypeRef,
} from "./model.js";
import type {
  CsharpTargetNamedTypeRef,
  CsharpTargetTypeRenderShape,
  CsharpTypeofRuntimeKind,
} from "./model.js";

export function csharpTargetNamedType(
  id: string,
  typeArguments: readonly TargetTypeRef[] | undefined,
  renderShape: CsharpTargetTypeRenderShape | undefined,
  metadata: {
    readonly arrayLiteralElementType?: TargetTypeRef;
    readonly arrayLiteralConstructionType?: TargetTypeRef;
    readonly arrayLiteralBuilder?: CsharpTargetNamedTypeRef["csharpArrayLiteralBuilder"];
    readonly implicitArrayInputElementType?: TargetTypeRef;
    readonly enumerableElementType?: TargetTypeRef;
    readonly arrayLikeElementType?: TargetTypeRef;
    readonly readOnlyIndexableElementType?: TargetTypeRef;
    readonly denseMutableElementType?: TargetTypeRef;
    readonly indexableLengthMemberName?: string;
    readonly indexableReadMember?: CsharpTargetNamedTypeRef["csharpIndexableReadMember"];
    readonly collectionSemantics?: CsharpTargetNamedTypeRef["csharpCollectionSemantics"];
    readonly delegateSignature?: CsharpTargetNamedTypeRef["csharpDelegateSignature"];
    readonly expressionTreeDelegateType?: TargetTypeRef;
    readonly generatorProtocol?: CsharpTargetNamedTypeRef["csharpGeneratorProtocol"];
    readonly iteratorResultProtocol?: CsharpTargetNamedTypeRef["csharpIteratorResultProtocol"];
    readonly flowRefinementRepresentation?: CsharpTargetNamedTypeRef["csharpFlowRefinementRepresentation"];
    readonly specialType?: CsharpTargetNamedTypeRef["csharpSpecialType"];
    readonly sourceDeclarationKind?: CsharpTargetNamedTypeRef["csharpSourceDeclarationKind"];
    readonly baseType?: TargetTypeRef;
    readonly structuralContract?: true;
    readonly generatedStructuralStorage?: true;
    readonly throwable?: true;
    readonly typeofRuntimeKind?: CsharpTypeofRuntimeKind;
    readonly valueType?: true;
    readonly byRefLike?: true;
    readonly constraintRequiresReferenceType?: true;
    readonly allowsRefLikeTypeArguments: readonly boolean[];
    readonly absorbsNullish?: true;
    readonly jsValueCarrier?: true;
    readonly jsStringCarrier?: true;
    readonly jsObjectShape?: true;
  },
): CsharpTargetNamedTypeRef {
  if (typeof metadata === "object" && metadata !== null && metadata.constraintRequiresReferenceType !== undefined &&
    (metadata.constraintRequiresReferenceType !== true || metadata.valueType === true || metadata.byRefLike === true ||
      metadata.sourceDeclarationKind !== undefined && metadata.sourceDeclarationKind !== "class")) {
    throw new TypeError("A C# reference-only bound guarantee must be literal true and cannot describe a value carrier.");
  }
  if (typeof metadata !== "object" || metadata === null || !Array.isArray(metadata.allowsRefLikeTypeArguments) ||
    metadata.allowsRefLikeTypeArguments.length !== (typeArguments?.length ?? 0) ||
    Object.keys(metadata.allowsRefLikeTypeArguments).length !== metadata.allowsRefLikeTypeArguments.length ||
    metadata.allowsRefLikeTypeArguments.some(allowed => typeof allowed !== "boolean")) {
    throw new TypeError("A physical C# named carrier requires its exact native generic-slot permissions.");
  }
  return {
    kind: "target-named",
    id,
    ...(typeArguments !== undefined && typeArguments.length > 0 ? { typeArguments } : {}),
    ...(renderShape !== undefined ? { csharpRender: renderShape } : {}),
    ...(metadata.arrayLiteralElementType !== undefined ? { csharpArrayLiteralElementType: metadata.arrayLiteralElementType } : {}),
    ...(metadata.arrayLiteralConstructionType !== undefined ? { csharpArrayLiteralConstructionType: metadata.arrayLiteralConstructionType } : {}),
    ...(metadata.arrayLiteralBuilder !== undefined ? { csharpArrayLiteralBuilder: metadata.arrayLiteralBuilder } : {}),
    ...(metadata.implicitArrayInputElementType !== undefined ? { csharpImplicitArrayInputElementType: metadata.implicitArrayInputElementType } : {}),
    ...(metadata.enumerableElementType !== undefined ? { csharpEnumerableElementType: metadata.enumerableElementType } : {}),
    ...(metadata.arrayLikeElementType !== undefined ? { csharpArrayLikeElementType: metadata.arrayLikeElementType } : {}),
    ...(metadata.readOnlyIndexableElementType !== undefined ? { csharpReadOnlyIndexableElementType: metadata.readOnlyIndexableElementType } : {}),
    ...(metadata.denseMutableElementType !== undefined ? { csharpDenseMutableElementType: metadata.denseMutableElementType } : {}),
    ...(metadata.indexableLengthMemberName !== undefined
      ? { csharpIndexableLengthMemberName: metadata.indexableLengthMemberName }
      : {}),
    ...(metadata.indexableReadMember !== undefined
      ? { csharpIndexableReadMember: metadata.indexableReadMember }
      : {}),
    ...(metadata.collectionSemantics !== undefined
      ? { csharpCollectionSemantics: metadata.collectionSemantics }
      : {}),
    ...(metadata.delegateSignature !== undefined ? { csharpDelegateSignature: metadata.delegateSignature } : {}),
    ...(metadata.expressionTreeDelegateType !== undefined ? { csharpExpressionTreeDelegateType: metadata.expressionTreeDelegateType } : {}),
    ...(metadata.generatorProtocol !== undefined ? { csharpGeneratorProtocol: metadata.generatorProtocol } : {}),
    ...(metadata.iteratorResultProtocol !== undefined ? { csharpIteratorResultProtocol: metadata.iteratorResultProtocol } : {}),
    ...(metadata.flowRefinementRepresentation !== undefined
      ? { csharpFlowRefinementRepresentation: metadata.flowRefinementRepresentation }
      : {}),
    ...(metadata.specialType !== undefined ? { csharpSpecialType: metadata.specialType } : {}),
    ...(metadata.sourceDeclarationKind !== undefined ? { csharpSourceDeclarationKind: metadata.sourceDeclarationKind } : {}),
    ...(metadata.baseType !== undefined ? { csharpBaseType: metadata.baseType } : {}),
    ...(metadata.structuralContract === true ? { csharpStructuralContract: true as const } : {}),
    ...(metadata.generatedStructuralStorage === true ? { csharpGeneratedStructuralStorage: true as const } : {}),
    ...(metadata.throwable === true ? { csharpThrowable: true } : {}),
    ...(metadata.typeofRuntimeKind !== undefined ? { csharpTypeofRuntimeKind: metadata.typeofRuntimeKind } : {}),
    ...(metadata.valueType === true ? { csharpValueType: true } : {}),
    ...(metadata.byRefLike === true ? { csharpByRefLike: true } : {}),
    ...(metadata.constraintRequiresReferenceType === true ? { csharpConstraintRequiresReferenceType: true as const } : {}),
    csharpAllowsRefLikeTypeArguments: Object.freeze([...metadata.allowsRefLikeTypeArguments]),
    ...(metadata.absorbsNullish === true ? { csharpAbsorbsNullish: true } : {}),
    ...(metadata.jsValueCarrier === true
      ? { csharpJsValueCarrier: true }
      : {}),
    ...(metadata.jsStringCarrier === true
      ? { csharpJsStringCarrier: true }
      : {}),
    ...(metadata.jsObjectShape === true
      ? { csharpJsObjectShape: true }
      : {}),
  } satisfies CsharpTargetNamedTypeRef;
}
