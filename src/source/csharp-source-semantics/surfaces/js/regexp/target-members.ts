import type {
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  csharpNullableTargetType,
  csharpQualifiedTypeRenderShape,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpTargetNamedType,
  targetParameter,
} from "../source-library.js";
import type {
  JsSurfaceTargetMemberMetadata,
} from "../target-member-metadata.js";
import {
  jsSurfaceTargetMemberMetadataIdentityIndex,
} from "../target-member-metadata.js";
import {
  csharpJsRegExpTargetType,
} from "./target-type.js";

const regExpType = csharpJsRegExpTargetType();
const regExpStringType = csharpStringTargetType();
const regExpBoolType = csharpSourcePrimitiveTargetType("bool");
const regExpMatchResultType = csharpTargetNamedType("Tsonic.CSharp.Js.RegExpMatchResult", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "RegExpMatchResult"));
const regExpCapabilityId = "surface.js.math-json-regexp";
const regExpRequiredFacts = [
  "selected source declaration/signature identity",
  "closed RegExp receiver or constructor target facts",
  "Tsonic.CSharp.Js.RegExp runtime metadata row",
] as const;

interface RegExpPropertyMetadataRow {
  readonly id: string;
  readonly sourceName: string;
  readonly targetName: string;
  readonly returnType: TargetTypeRef;
}

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
    capabilityId: regExpCapabilityId,
    requiredFacts: ["selected RegExp constructor source signature", "closed pattern argument target facts", "Tsonic.CSharp.Js.RegExp constructor metadata row"],
    semanticEquivalence: "Selected Tsonic.CSharp.Js.RegExp constructor preserves ECMAScript RegExp construction for closed string pattern and flag carriers.",
  },
  {
    id: "Tsonic.CSharp.Js.RegExp.exec",
    sourceName: "exec",
    targetName: "exec",
    kind: "method",
    parameters: [targetParameter("value", regExpStringType)],
    returnType: csharpNullableTargetType(regExpMatchResultType),
    declaringType: regExpType,
    capabilityId: regExpCapabilityId,
    requiredFacts: regExpRequiredFacts,
    semanticEquivalence: "Selected Tsonic.CSharp.Js.RegExp.exec runtime member preserves ECMAScript RegExp.exec match/null semantics for closed string arguments.",
  },
  {
    id: "Tsonic.CSharp.Js.RegExp.test",
    sourceName: "test",
    targetName: "test",
    kind: "method",
    parameters: [targetParameter("value", regExpStringType)],
    returnType: regExpBoolType,
    declaringType: regExpType,
    capabilityId: regExpCapabilityId,
    requiredFacts: regExpRequiredFacts,
    semanticEquivalence: "Selected Tsonic.CSharp.Js.RegExp.test runtime member preserves ECMAScript RegExp.test boolean match semantics for closed string arguments.",
  },
  {
    id: "Tsonic.CSharp.Js.RegExp.toString",
    sourceName: "toString",
    targetName: "toString",
    kind: "method",
    parameters: [],
    returnType: regExpStringType,
    declaringType: regExpType,
    capabilityId: regExpCapabilityId,
    requiredFacts: regExpRequiredFacts,
    semanticEquivalence: "Selected Tsonic.CSharp.Js.RegExp.toString runtime member preserves ECMAScript RegExp source/flags stringification for closed RegExp carriers.",
  },
] satisfies readonly JsSurfaceTargetMemberMetadata[];
export const regExpTargetMemberIdentityIndex = jsSurfaceTargetMemberMetadataIdentityIndex("RegExp", regExpTargetMemberMetadata);

const regExpPropertyTargetMemberMetadata = [
  ...[
    { id: "Tsonic.CSharp.Js.RegExp.source", sourceName: "source", targetName: "source", returnType: regExpStringType },
    { id: "Tsonic.CSharp.Js.RegExp.flags", sourceName: "flags", targetName: "flags", returnType: regExpStringType },
  ].map(regExpPropertyMetadata),
  ...[
    { id: "Tsonic.CSharp.Js.RegExp.global", sourceName: "global", targetName: "global", returnType: regExpBoolType },
    { id: "Tsonic.CSharp.Js.RegExp.hasIndices", sourceName: "hasIndices", targetName: "hasIndices", returnType: regExpBoolType },
    { id: "Tsonic.CSharp.Js.RegExp.ignoreCase", sourceName: "ignoreCase", targetName: "ignoreCase", returnType: regExpBoolType },
    { id: "Tsonic.CSharp.Js.RegExp.multiline", sourceName: "multiline", targetName: "multiline", returnType: regExpBoolType },
    { id: "Tsonic.CSharp.Js.RegExp.dotAll", sourceName: "dotAll", targetName: "dotAll", returnType: regExpBoolType },
    { id: "Tsonic.CSharp.Js.RegExp.unicode", sourceName: "unicode", targetName: "unicode", returnType: regExpBoolType },
    { id: "Tsonic.CSharp.Js.RegExp.unicodeSets", sourceName: "unicodeSets", targetName: "unicodeSets", returnType: regExpBoolType },
    { id: "Tsonic.CSharp.Js.RegExp.sticky", sourceName: "sticky", targetName: "sticky", returnType: regExpBoolType },
  ].map(regExpPropertyMetadata),
  regExpPropertyMetadata({ id: "Tsonic.CSharp.Js.RegExp.lastIndex", sourceName: "lastIndex", targetName: "lastIndex", returnType: csharpSourcePrimitiveTargetType("int32") }),
] satisfies readonly JsSurfaceTargetMemberMetadata[];
export const regExpPropertyTargetMemberIdentityIndex = jsSurfaceTargetMemberMetadataIdentityIndex("RegExp", regExpPropertyTargetMemberMetadata);

function regExpPropertyMetadata(row: RegExpPropertyMetadataRow): JsSurfaceTargetMemberMetadata {
  return {
    id: row.id,
    sourceName: row.sourceName,
    targetName: row.targetName,
    kind: "property",
    returnType: row.returnType,
    declaringType: regExpType,
    capabilityId: regExpCapabilityId,
    requiredFacts: ["selected source property identity", "closed RegExp receiver target facts", "Tsonic.CSharp.Js.RegExp runtime property metadata row"],
    semanticEquivalence: "Selected Tsonic.CSharp.Js.RegExp runtime property preserves the corresponding ECMAScript RegExp property semantics for closed RegExp carriers.",
  };
}
