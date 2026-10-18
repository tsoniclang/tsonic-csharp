import type { CsharpTargetNamedTypeRef, TargetTypeRef } from "../types/model.js";
import { targetTypeRefEquals } from "../types/equality.js";
import { csharpTsValueTargetType, isCsharpJsValueTargetType } from "../types/carriers/runtime-carriers.js";
import { isCsharpNullableReferenceTargetType } from "../types/carriers/nullable.js";
import { csharpRenderShapeForTargetNamedType } from "../types/render-shapes.js";

const nativeJsValueRender = csharpTsValueTargetType().csharpRender;

export function csharpNativeRepresentationMatches(source: TargetTypeRef, target: TargetTypeRef): boolean {
  if (targetTypeRefEquals(source, target)) return false;
  return canonicalJsValue(source) && canonicalJsValue(target);
}

function canonicalJsValue(type: TargetTypeRef): boolean {
  if (type.kind !== "target-named" || !isCsharpJsValueTargetType(type) ||
    isCsharpNullableReferenceTargetType(type) || (type.typeArguments?.length ?? 0) !== 0 ||
    (type as CsharpTargetNamedTypeRef).csharpMethodValue !== undefined) return false;
  const render = csharpRenderShapeForTargetNamedType(type);
  if (render?.kind !== "named" || nativeJsValueRender?.kind !== "named") return false;
  const namespace = render.namespace ?? [];
  const nativeNamespace = nativeJsValueRender.namespace ?? [];
  return render.name === nativeJsValueRender.name && render.externAlias === nativeJsValueRender.externAlias &&
    (render.genericArity ?? 0) === (nativeJsValueRender.genericArity ?? 0) &&
    render.usingNamespace === nativeJsValueRender.usingNamespace &&
    (render.nested?.length ?? 0) === 0 && (nativeJsValueRender.nested?.length ?? 0) === 0 &&
    namespace.length === nativeNamespace.length && namespace.every((part, index) => part === nativeNamespace[index]);
}
