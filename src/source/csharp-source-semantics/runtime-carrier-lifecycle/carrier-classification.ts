import type {
  ExtensionObservationContext,
  Node,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  targetTypeRefContainsSourcePrimitive,
} from "../target-ref-utils.js";

export function runtimeCarrierFactIsSafeForSharedSemanticTypeSubject(type: TargetTypeRef): boolean {
  if (targetTypeRefContainsSourcePrimitive(type)) {
    return false;
  }
  return type.kind === "target-named" && (type.typeArguments?.length ?? 0) === 0;
}

export function isObjectLiteralInterfaceDeclarationCarrier(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
  carrier: TargetTypeRef,
): boolean {
  return ast.is.IsObjectLiteralExpression(node) &&
    carrier.kind === "target-named" &&
    (carrier as { readonly csharpSourceDeclarationKind?: unknown }).csharpSourceDeclarationKind === "interface";
}

export function isObjectLiteralGeneratedShapeCarrier(
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
  node: Node,
  carrier: TargetTypeRef,
): boolean {
  return ast.is.IsObjectLiteralExpression(node) &&
    isGeneratedObjectShapeCarrier(carrier);
}

export function isGeneratedObjectShapeCarrier(carrier: TargetTypeRef): boolean {
  return carrier.kind === "target-named" &&
    carrier.id.startsWith("__TsonicShape_");
}

export function isSourceDeclarationCarrier(type: TargetTypeRef): boolean {
  return type.kind === "target-named" &&
    (type as { readonly csharpSourceDeclarationKind?: unknown }).csharpSourceDeclarationKind !== undefined &&
    (type as { readonly csharpJsSurfaceKind?: unknown }).csharpJsSurfaceKind === undefined;
}

export function isRuntimeUnionCarrier(type: TargetTypeRef): boolean {
  return type.kind === "target-named" &&
    ((type as { readonly csharpRuntimeUnionArms?: unknown }).csharpRuntimeUnionArms !== undefined ||
      type.id.startsWith("Tsonic.CSharp.Runtime.Union`"));
}
