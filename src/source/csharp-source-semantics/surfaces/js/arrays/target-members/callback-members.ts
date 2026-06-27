import type {
  TargetTypeParameter,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  csharpDelegateTargetType,
  csharpSourcePrimitiveTargetType,
  targetParameter,
} from "../../source-library.js";
import type {
  JsSurfaceTargetMemberMetadata,
} from "../../target-member-metadata.js";
import {
  arrayHelperMethod,
} from "./builders.js";

export function arrayCallbackHelpers(
  sourceName: string,
  targetName: string,
  delegateKind: "System.Action" | "System.Func",
  itemType: TargetTypeRef,
  callbackReturnType: TargetTypeRef,
  memberReturnType: TargetTypeRef,
  arrayType: TargetTypeRef,
  declaringType: TargetTypeRef,
  options: { readonly idBase: string; readonly compareCallback?: boolean; readonly mutable?: boolean; readonly typeParameters?: readonly TargetTypeParameter[] },
): readonly JsSurfaceTargetMemberMetadata[] {
  const intType = csharpSourcePrimitiveTargetType("int32");
  const callbackShapes: readonly TargetTypeRef[] = options.compareCallback === true
    ? [csharpDelegateTargetType("System.Func", [itemType, itemType], callbackReturnType)]
    : delegateKind === "System.Action"
    ? [
        csharpDelegateTargetType("System.Action", [itemType]),
        csharpDelegateTargetType("System.Action", [itemType, intType]),
        csharpDelegateTargetType("System.Action", [itemType, intType, arrayType]),
      ]
    : [
        csharpDelegateTargetType("System.Func", [itemType], callbackReturnType),
        csharpDelegateTargetType("System.Func", [itemType, intType], callbackReturnType),
        csharpDelegateTargetType("System.Func", [itemType, intType, arrayType], callbackReturnType),
      ];
  return callbackShapes.map((callback, index) => arrayHelperMethod(sourceName, targetName, [
    targetParameter("array", arrayType),
    targetParameter("callback", callback),
  ], memberReturnType, declaringType, { idSuffix: `${options.idBase}:${index + 1}`, typeParameters: options.typeParameters }));
}
