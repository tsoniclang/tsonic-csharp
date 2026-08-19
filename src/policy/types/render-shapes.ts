import type {
  TargetTypeRef,
} from "./model/definitions.js";
import type {
  CsharpTargetNamedTypeRef,
  CsharpTargetTypeRenderShape,
} from "./model/definitions.js";

export function csharpRenderShapeForTargetNamedType(
  type: Extract<TargetTypeRef, { readonly kind: "target-named" }>,
): CsharpTargetTypeRenderShape | undefined {
  return (type as CsharpTargetNamedTypeRef).csharpRender;
}

export function csharpQualifiedTypeRenderShape(namespaceName: string, name: string): CsharpTargetTypeRenderShape {
  return {
    kind: "named",
    namespace: namespaceName.split(".").filter((part) => part.length > 0),
    name,
  };
}
