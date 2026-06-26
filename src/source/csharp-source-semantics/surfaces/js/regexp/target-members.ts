import type {
  TargetMember,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  targetParameter,
} from "../source-library.js";
import type {
  JsSurfaceTargetMemberMetadata,
} from "../target-member-metadata.js";
import {
  jsSurfaceSingleTargetMemberForSourceName,
  jsSurfaceTargetMemberMetadataIndex,
  jsSurfaceTargetMembersForSourceName,
} from "../target-member-metadata.js";
import {
  csharpJsRegExpTargetType,
} from "./target-type.js";

export function regExpTargetMembersForSourceName(sourceName: string): readonly TargetMember[] {
  return jsSurfaceTargetMembersForSourceName(regExpTargetMemberIndex, sourceName);
}

export function regExpPropertyTargetMemberForSourceName(sourceName: string): TargetMember | undefined {
  return jsSurfaceSingleTargetMemberForSourceName(regExpPropertyTargetMemberIndex, sourceName);
}

const regExpType = csharpJsRegExpTargetType();
const regExpStringType = csharpStringTargetType();
const regExpBoolType = csharpSourcePrimitiveTargetType("bool");
const regExpTargetMemberMetadata = [
  {
    id: "Tsonic.CSharp.Js.RegExp..ctor(System.String,System.String)",
    sourceName: "constructor",
    targetName: "RegExp",
    kind: "constructor",
    parameters: [
      targetParameter("pattern", regExpStringType),
      targetParameter("flags", regExpStringType, { optional: true }),
    ],
    returnType: regExpType,
    declaringType: regExpType,
  },
  {
    id: "Tsonic.CSharp.Js.RegExp.test",
    sourceName: "test",
    targetName: "test",
    kind: "method",
    parameters: [targetParameter("value", regExpStringType)],
    returnType: regExpBoolType,
  },
] satisfies readonly JsSurfaceTargetMemberMetadata[];
const regExpTargetMemberIndex = jsSurfaceTargetMemberMetadataIndex(regExpTargetMemberMetadata);

const regExpPropertyTargetMemberMetadata = [
  ...["source", "flags"].map((sourceName) => regExpPropertyMetadata(sourceName, regExpStringType)),
  ...[
    "global",
    "hasIndices",
    "ignoreCase",
    "multiline",
    "dotAll",
    "unicode",
    "unicodeSets",
    "sticky",
  ].map((sourceName) => regExpPropertyMetadata(sourceName, regExpBoolType)),
  regExpPropertyMetadata("lastIndex", csharpSourcePrimitiveTargetType("int32")),
] satisfies readonly JsSurfaceTargetMemberMetadata[];
const regExpPropertyTargetMemberIndex = jsSurfaceTargetMemberMetadataIndex(regExpPropertyTargetMemberMetadata);

function regExpPropertyMetadata(sourceName: string, returnType: TargetTypeRef): JsSurfaceTargetMemberMetadata {
  return {
    id: `Tsonic.CSharp.Js.RegExp.${sourceName}`,
    sourceName,
    targetName: sourceName,
    kind: "property",
    returnType,
    declaringType: regExpType,
  };
}
