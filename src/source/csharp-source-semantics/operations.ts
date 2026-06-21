import type {
  CheckedOperationMappingResult,
  ExtensionEvidence,
  ExtensionFactSubject,
  ExtensionObservationContext,
  TargetMember,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  csharpTargetOperationFactKey,
} from "../csharp-facts.js";
import type {
  CsharpTargetOperationFact,
  CsharpTypeofRuntimeKind,
  CsharpTargetOperatorOperation,
} from "../csharp-facts.js";

export function targetOperation(
  operationId: string,
  operationKind: "property" | "method" | "indexer" | "operator" | "constructor" | "iteration",
  targetOperation: string,
  options: { readonly resultType?: ExtensionFactSubject } = {},
): CheckedOperationMappingResult["operation"] {
  return {
    operationId,
    operationKind,
    targetOperation,
    ...(options.resultType !== undefined ? { resultType: options.resultType } : {}),
  };
}

export function targetOperationFromMember(member: TargetMember): CheckedOperationMappingResult["operation"] {
  return {
    operationId: member.id,
    operationKind: member.kind === "field" || member.kind === "event" ? "property" : member.kind,
    targetOperation: member.targetName,
  };
}

export function csharpTargetOperationFromMember(member: TargetMember): CsharpTargetOperationFact {
  return {
    kind: "member",
    operationId: member.id,
    operationKind: member.kind === "field" || member.kind === "event" ? "property" : member.kind,
    memberName: member.targetName,
    ...(member.static === true ? { static: true } : {}),
    ...(member.declaringType !== undefined ? { declaringType: member.declaringType } : {}),
    ...(member.returnType !== undefined ? { resultType: member.returnType } : {}),
  };
}

export function csharpTargetMemberOperation(
  operationId: string,
  operationKind: "property" | "method" | "indexer" | "constructor",
  memberName: string,
  options: {
    readonly static?: boolean;
    readonly declaringType?: TargetTypeRef;
    readonly resultType?: TargetTypeRef;
  } = {},
): CsharpTargetOperationFact {
  return {
    kind: "member",
    operationId,
    operationKind,
    memberName,
    ...(options.static === true ? { static: true } : {}),
    ...(options.declaringType !== undefined ? { declaringType: options.declaringType } : {}),
    ...(options.resultType !== undefined ? { resultType: options.resultType } : {}),
  };
}

export function csharpTargetIntrinsicOperatorOperation(
  operationId: string,
  operator: CsharpTargetOperatorOperation,
  resultType?: TargetTypeRef,
): CsharpTargetOperationFact {
  return {
    kind: "intrinsic-operator",
    operationId,
    operator,
    ...(resultType !== undefined ? { resultType } : {}),
  };
}

export function csharpTargetTypeofRuntimeOperation(
  operationId: string,
  runtimeKind: CsharpTypeofRuntimeKind,
  resultType?: TargetTypeRef,
): CsharpTargetOperationFact {
  return {
    kind: "typeof-runtime",
    operationId,
    runtimeKind,
    ...(resultType !== undefined ? { resultType } : {}),
  };
}

export function csharpTargetTypeofComparisonOperation(
  operationId: string,
  runtimeKind: CsharpTypeofRuntimeKind,
  negated: boolean,
  resultType?: TargetTypeRef,
): CsharpTargetOperationFact {
  return {
    kind: "typeof-comparison",
    operationId,
    runtimeKind,
    negated,
    ...(resultType !== undefined ? { resultType } : {}),
  };
}

export function recordCsharpTargetOperation(
  context: ExtensionObservationContext,
  subject: ExtensionFactSubject,
  operation: CsharpTargetOperationFact,
  evidence: readonly ExtensionEvidence[] = [],
): void {
  context.facts.set(subject, csharpTargetOperationFactKey, operation, evidence);
}
