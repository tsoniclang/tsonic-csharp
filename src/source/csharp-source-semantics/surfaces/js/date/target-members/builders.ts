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

export interface DateSemanticExceptionMetadata {
  readonly reason: string;
  readonly provenance: string;
}

export interface DateTargetMemberIdentityMetadata {
  readonly id: string;
  readonly sourceName: string;
  readonly targetName: string;
  readonly semanticException?: DateSemanticExceptionMetadata;
}

export type DateTargetMemberMetadata = JsSurfaceTargetMemberMetadata & {
  readonly semanticException?: DateSemanticExceptionMetadata;
};

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
  identity: DateTargetMemberIdentityMetadata,
  parameters: readonly ReturnType<typeof targetParameter>[],
  returnType: TargetTypeRef,
): DateTargetMemberMetadata {
  return {
    id: identity.id,
    sourceName: identity.sourceName,
    targetName: identity.targetName,
    kind: "method",
    parameters,
    returnType,
    declaringType: dateTargetMemberTypes.dateType,
    static: true,
    ...(identity.semanticException === undefined ? {} : { semanticException: identity.semanticException }),
  };
}

export function dateMethodMetadata(
  identity: DateTargetMemberIdentityMetadata,
  parameters: readonly ReturnType<typeof targetParameter>[],
  returnType: TargetTypeRef,
): DateTargetMemberMetadata {
  return {
    id: identity.id,
    sourceName: identity.sourceName,
    targetName: identity.targetName,
    kind: "method",
    parameters,
    returnType,
    declaringType: dateTargetMemberTypes.dateType,
    ...(identity.semanticException === undefined ? {} : { semanticException: identity.semanticException }),
  };
}

export function optionalIntParameter(name: string): ReturnType<typeof targetParameter> {
  return targetParameter(name, dateTargetMemberTypes.nullableIntType, { optional: true });
}
