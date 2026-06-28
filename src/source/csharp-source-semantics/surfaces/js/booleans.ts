import type {
  TargetMember,
} from "@tsonic/tsts";
import {
  csharpQualifiedTypeRenderShape,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpTargetNamedType,
  targetParameter,
} from "./source-library.js";
import type {
  JsSurfaceTargetMemberMetadata,
} from "./target-member-metadata.js";
import {
  jsSurfaceTargetMemberFromMetadata,
  jsSurfaceTargetMembersForSelectedSourceIdentity,
  jsSurfaceTargetMemberMetadataIdentityIndex,
} from "./target-member-metadata.js";
import type {
  JsSurfaceSelectedSourceIdentity,
} from "./target-member-metadata.js";

const boolType = csharpSourcePrimitiveTargetType("bool");
const stringType = csharpStringTargetType();
const booleanOpsType = csharpTargetNamedType("Tsonic.CSharp.Js.BooleanOps", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "BooleanOps"));
const globalsType = csharpTargetNamedType("Tsonic.CSharp.Js.Globals", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "Globals"));
const objectType = csharpTargetNamedType("System.Object", undefined, { kind: "predefined", name: "object" });
const booleanReceiverParameter = targetParameter("value", boolType);
const booleanConversionParameter = targetParameter("value", objectType, {
  optional: true,
  csharpAcceptsClosedSourceArgument: true,
});
const booleanMetadataEvidence = {
  capabilityId: "surface.js.boolean-methods",
  requiredFacts: [
    "selected source declaration/signature identity",
    "closed bool receiver target facts",
    "Tsonic.CSharp.Js.BooleanOps runtime metadata row",
  ],
  semanticEquivalence: "Selected Tsonic.CSharp.Js.BooleanOps runtime member preserves ECMAScript Boolean primitive operation semantics.",
} as const;
const booleanTargetMemberMetadata = [
  {
    id: "Tsonic.CSharp.Js.BooleanOps.toString",
    sourceName: "toString",
    targetName: "toString",
    kind: "method",
    parameters: [booleanReceiverParameter],
    returnType: stringType,
    declaringType: booleanOpsType,
    static: true,
    receiverPassing: "first-argument",
    ...booleanMetadataEvidence,
  },
  {
    id: "Tsonic.CSharp.Js.BooleanOps.valueOf",
    sourceName: "valueOf",
    targetName: "valueOf",
    kind: "method",
    parameters: [booleanReceiverParameter],
    returnType: boolType,
    declaringType: booleanOpsType,
    static: true,
    receiverPassing: "first-argument",
    ...booleanMetadataEvidence,
  },
] satisfies readonly JsSurfaceTargetMemberMetadata[];
export const booleanTargetMemberIdentityIndex = jsSurfaceTargetMemberMetadataIdentityIndex("Boolean", booleanTargetMemberMetadata);

const booleanConstructorMetadataEvidence = {
  capabilityId: "surface.js.boolean-methods",
  requiredFacts: [
    "selected BooleanConstructor call signature identity",
    "call-vs-construct expression shape",
    "closed target facts for provided conversion argument",
    "Tsonic.CSharp.Js.Globals.Boolean runtime metadata row",
  ],
  semanticEquivalence: "Selected Boolean(value) source call preserves ECMAScript Boolean conversion semantics through Tsonic.CSharp.Js.Globals.Boolean; new Boolean(value) is intentionally not selected without a closed wrapper-object carrier.",
} as const;

const booleanConstructorCallTargetMemberMetadata = [
  {
    id: "Tsonic.CSharp.Js.Globals.Boolean(System.Object)",
    sourceName: "constructor",
    targetName: "Boolean",
    kind: "method",
    parameters: [booleanConversionParameter],
    returnType: boolType,
    declaringType: globalsType,
    static: true,
    ...booleanConstructorMetadataEvidence,
  },
] satisfies readonly JsSurfaceTargetMemberMetadata[];

const booleanConstructorCallTargetMembers = booleanConstructorCallTargetMemberMetadata.map(jsSurfaceTargetMemberFromMetadata);

export function isCsharpBooleanTargetType(type: unknown): boolean {
  return (type as { readonly kind?: unknown; readonly name?: unknown } | undefined)?.kind === "source-primitive" &&
    (type as { readonly name?: unknown }).name === "bool";
}

export function booleanTargetMembersForSelectedIdentity(
  selectedIdentity: JsSurfaceSelectedSourceIdentity,
): readonly TargetMember[] {
  return jsSurfaceTargetMembersForSelectedSourceIdentity(booleanTargetMemberIdentityIndex, selectedIdentity);
}

export function booleanConstructorTargetMembersForSelectedIdentity(
  selectedIdentity: JsSurfaceSelectedSourceIdentity,
  mode: "call" | "new",
): readonly TargetMember[] {
  return mode === "call" && selectedIdentity.key === "Boolean.constructor"
    ? booleanConstructorCallTargetMembers
    : [];
}
