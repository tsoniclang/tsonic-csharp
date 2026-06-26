import type {
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  targetParameter,
} from "../../source-library.js";
import type {
  JsSurfaceTargetMemberMetadata,
} from "../../target-member-metadata.js";
import {
  dateTargetMemberTypes,
} from "./types.js";

export function dateConstructorMetadata(
  id: string,
  parameters: readonly ReturnType<typeof targetParameter>[],
): JsSurfaceTargetMemberMetadata {
  return {
    id,
    sourceName: "constructor",
    targetName: "Date",
    kind: "constructor",
    parameters,
    returnType: dateTargetMemberTypes.dateType,
    declaringType: dateTargetMemberTypes.dateType,
  };
}

export function dateStaticMethodMetadata(
  sourceName: string,
  parameters: readonly ReturnType<typeof targetParameter>[],
  returnType: TargetTypeRef,
): JsSurfaceTargetMemberMetadata {
  return {
    id: `Tsonic.CSharp.Js.Date.${sourceName}`,
    sourceName,
    targetName: sourceName,
    kind: "method",
    parameters,
    returnType,
    declaringType: dateTargetMemberTypes.dateType,
    static: true,
  };
}

export function dateMethodMetadata(
  sourceName: string,
  parameters: readonly ReturnType<typeof targetParameter>[],
  returnType: TargetTypeRef,
  targetName = sourceName,
): JsSurfaceTargetMemberMetadata {
  return {
    id: `Tsonic.CSharp.Js.Date.${sourceName}`,
    sourceName,
    targetName,
    kind: "method",
    parameters,
    returnType,
    declaringType: dateTargetMemberTypes.dateType,
  };
}

export function optionalIntParameter(name: string): ReturnType<typeof targetParameter> {
  return targetParameter(name, dateTargetMemberTypes.nullableIntType, { optional: true });
}
