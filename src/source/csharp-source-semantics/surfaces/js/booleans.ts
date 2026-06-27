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
  jsSurfaceTargetMembersForSelectedSourceIdentity,
  jsSurfaceTargetMemberMetadataIdentityIndex,
} from "./target-member-metadata.js";
import type {
  JsSurfaceSelectedSourceIdentity,
} from "./target-member-metadata.js";

const boolType = csharpSourcePrimitiveTargetType("bool");
const stringType = csharpStringTargetType();
const booleanOpsType = csharpTargetNamedType("Tsonic.CSharp.Js.BooleanOps", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "BooleanOps"));
const booleanReceiverParameter = targetParameter("value", boolType);
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

export function isCsharpBooleanTargetType(type: unknown): boolean {
  return (type as { readonly kind?: unknown; readonly name?: unknown } | undefined)?.kind === "source-primitive" &&
    (type as { readonly name?: unknown }).name === "bool";
}

export function booleanTargetMembersForSelectedIdentity(
  selectedIdentity: JsSurfaceSelectedSourceIdentity,
): readonly TargetMember[] {
  return jsSurfaceTargetMembersForSelectedSourceIdentity(booleanTargetMemberIdentityIndex, selectedIdentity);
}
