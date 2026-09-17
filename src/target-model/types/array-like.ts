import type { CsharpTargetNamedTypeRef, TargetTypeRef } from "./model.js";
import { csharpTargetNamedType } from "./factories.js";
import { csharpQualifiedTypeRenderShape } from "./render-shapes.js";
import { getCsharpRuntimeUnionArms } from "./runtime-carriers.js";
import { targetTypeRefEquals } from "./equality.js";

export function csharpArrayLikeTargetType(element: TargetTypeRef): CsharpTargetNamedTypeRef {
  return csharpTargetNamedType("Tsonic.CSharp.Js.IArrayLike`1", [element],
    csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "IArrayLike"));
}

export function csharpArrayLikeElement(type: TargetTypeRef | undefined): TargetTypeRef | undefined {
  if (type?.kind !== "target-named") return undefined;
  const arms = getCsharpRuntimeUnionArms(type);
  if (arms === undefined) return (type as CsharpTargetNamedTypeRef).csharpArrayLikeElementType;
  const elements = arms.map(arm => arm.kind === "target-named"
    ? (arm as CsharpTargetNamedTypeRef).csharpArrayLikeElementType : undefined);
  const first = elements[0];
  return first !== undefined && elements.every(element => element !== undefined && targetTypeRefEquals(element, first))
    ? first : undefined;
}
