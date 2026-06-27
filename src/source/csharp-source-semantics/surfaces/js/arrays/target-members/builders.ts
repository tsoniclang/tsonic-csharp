import type {
  TargetParameter,
  TargetTypeParameter,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  JsSurfaceTargetMemberMetadata,
} from "../../target-member-metadata.js";

export function arrayStaticMethod(
  sourceName: string,
  targetName: string,
  parameters: readonly TargetParameter[],
  returnType: TargetTypeRef,
  declaringType: TargetTypeRef,
  idSuffix: string,
): JsSurfaceTargetMemberMetadata {
  const owner = declaringType.kind === "target-named" ? declaringType.id.replace(/`.*$/, "") : "Tsonic.CSharp.Js.Array";
  return {
    id: `${owner}.${idSuffix}`,
    sourceName,
    targetName,
    kind: "method",
    parameters,
    returnType,
    declaringType,
    static: true,
  };
}

export function arrayConstructor(
  id: string,
  declaringType: TargetTypeRef,
  parameters: readonly TargetParameter[],
): JsSurfaceTargetMemberMetadata {
  return {
    id,
    sourceName: "constructor",
    targetName: "JSArray",
    kind: "constructor",
    parameters,
    returnType: declaringType,
    declaringType,
  };
}

export function arrayHelperMethod(
  sourceName: string,
  targetName: string,
  parameters: readonly TargetParameter[],
  returnType: TargetTypeRef,
  declaringType: TargetTypeRef,
  options: { readonly idSuffix: string; readonly typeParameters?: readonly TargetTypeParameter[] },
): JsSurfaceTargetMemberMetadata {
  return {
    id: `Tsonic.CSharp.Js.Array.${options.idSuffix}`,
    sourceName,
    targetName,
    kind: "method",
    parameters,
    returnType,
    declaringType,
    static: true,
    receiverPassing: "first-argument",
    ...(options.typeParameters === undefined ? {} : { typeParameters: options.typeParameters }),
  };
}
