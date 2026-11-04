import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import type { CsharpTypeParameterConstraintResolution } from "../../../../target-model/types/generic-constraints.js";
import type { CsharpCompletedStructuralMemberChildren, CsharpStructuralMemberApplication,
  CsharpStructuralMemberInheritance, CsharpStructuralTypeApplication } from "./structural-applications.js";

export type CsharpStructuralMemberChildRequest = {
  readonly application: CsharpStructuralTypeApplication;
  readonly memberIndex: number;
  readonly member: CsharpStructuralMemberApplication;
} & (
  | { readonly kind: "inheritance" }
  | { readonly kind: "base"; readonly source: CsharpStructuralMemberApplication["type"] }
  | { readonly kind: "value"; readonly source: NonNullable<CsharpStructuralMemberApplication["value"]> }
  | { readonly kind: "constraint"; readonly source: CsharpStructuralMemberApplication["constraints"][number] }
);

export type CsharpCompletedStructuralMemberChild = {
  readonly request: CsharpStructuralMemberChildRequest;
} & (
  | { readonly kind: "inheritance"; readonly inheritance: CsharpStructuralMemberInheritance }
  | { readonly kind: "base" | "value"; readonly type: TargetTypeRef | undefined }
  | { readonly kind: "constraint"; readonly resolution: CsharpTypeParameterConstraintResolution }
);

export function* completeCsharpStructuralMemberChildrenSource(
  application: CsharpStructuralTypeApplication,
  memberIndex: number,
): Generator<CsharpStructuralMemberChildRequest, CsharpCompletedStructuralMemberChildren | undefined,
  CsharpCompletedStructuralMemberChild> {
  const member = application.members[memberIndex];
  if (application.source.collection !== application.collection || application.source.members !== application.members ||
    application.source.capture !== application.capture || application.capture.collection !== application.collection.source ||
    application.members.length !== application.collection.members.length ||
    member === undefined || application.collection.members[memberIndex] !== member.source ||
    member.capture !== application.capture.members[memberIndex] || member.capture.source !== member.source.source) {
    return failTargetAnalysisInvariant("tsonic-csharp", "Structural child completion requires its exact ordered source member.");
  }
  if (member.type.kind === "method") {
    const capture = member.capture.type;
    const signature = member.type.signature;
    const state = member.source.state;
    if (capture.kind !== "method" || capture.type !== member.source.propertyType ||
      !Object.prototype.hasOwnProperty.call(member.type, "signature") ||
      (capture.signature === undefined ? signature !== undefined : signature === undefined ||
        signature.capture !== capture.signature || signature.source !== member.source.callableSignature ||
        signature.source.declaration !== member.source.callableDeclaration ||
        signature.state.depth !== state.depth + 1 || signature.state.sourceBindings !== state.sourceBindings ||
        signature.state.sourceStorageSubject !== state.sourceStorageSubject ||
        signature.state.sourceStorageBindings !== state.sourceStorageBindings ||
        signature.state.rejectNativeResolution !== state.rejectNativeResolution)) {
      return failTargetAnalysisInvariant("tsonic-csharp",
        "A structural method requires its exact declared signature before any native child.", member.source.methodDeclaration);
    }
  }
  const input = { application, memberIndex, member };
  const inheritanceRequest = Object.freeze({ ...input, kind: "inheritance" as const });
  const inherited = yield inheritanceRequest;
  if (inherited.request !== inheritanceRequest || inherited.kind !== "inheritance") {
    return failTargetAnalysisInvariant("tsonic-csharp", "Structural child completion requires its exact inheritance dependency.");
  }
  const inheritance = inherited.inheritance;
  if (inheritance.application !== application || inheritance.member !== member) {
    return failTargetAnalysisInvariant("tsonic-csharp", "Structural child completion requires the same member's inheritance selection.");
  }
  if (inheritance.selection.kind === "unresolved") return undefined;
  let baseType: TargetTypeRef | undefined;
  if (inheritance.selection.kind === "resolved") {
    baseType = inheritance.selection.type;
  } else {
    const request = Object.freeze({ ...input, kind: "base" as const, source: member.type });
    const completed = yield request;
    if (completed.request !== request || completed.kind !== "base") {
      return failTargetAnalysisInvariant("tsonic-csharp", "Structural child completion requires its exact native base dependency.");
    }
    baseType = completed.type;
  }
  if (baseType === undefined) return undefined;
  let value: CsharpCompletedStructuralMemberChildren["value"];
  if (member.value !== undefined) {
    const request = Object.freeze({ ...input, kind: "value" as const, source: member.value });
    const completed = yield request;
    if (completed.request !== request || completed.kind !== "value") {
      return failTargetAnalysisInvariant("tsonic-csharp", "Structural child completion requires its exact native value dependency.");
    }
    value = Object.freeze({ request: member.value, type: completed.type });
  }
  const constraints: CsharpCompletedStructuralMemberChildren["constraints"][number][] = [];
  for (const source of member.constraints) {
    const request = Object.freeze({ ...input, kind: "constraint" as const, source });
    const completed = yield request;
    if (completed.request !== request || completed.kind !== "constraint") {
      return failTargetAnalysisInvariant("tsonic-csharp", "Structural child completion requires its exact authored constraint dependency.");
    }
    constraints.push(Object.freeze({ request: source, resolution: completed.resolution }));
  }
  return Object.freeze({ inheritance, baseType, value, constraints: Object.freeze(constraints) });
}
