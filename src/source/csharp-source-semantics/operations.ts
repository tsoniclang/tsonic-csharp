import type {
  CheckedOperationMappingResult,
  ExtensionEvidence,
  ExtensionFactSubject,
  ExtensionFactWriteResult,
  ExtensionObservationContext,
  TargetMember,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  targetOperationFactKey,
} from "@tsonic/tsts";
import {
  csharpSourceOwnedPropertyOperationPrefix,
  csharpTargetMutationOperationFactKey,
  csharpTargetOperationFactKey,
} from "../csharp-facts.js";
import {
  extensionFactSubjectTypeRefEquals,
} from "../csharp-facts/equality.js";
import {
  getCsharpArrayLiteralElementTargetType,
} from "./target-types.js";
import type {
  CsharpTargetMember,
} from "./target-types.js";
import type {
  CsharpTargetOperationArgument,
  CsharpTargetConversionOperatorOperationFact,
  CsharpTargetMemberOperationFact,
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

export function recordTargetOperationFact(
  context: Pick<ExtensionObservationContext, "facts">,
  subject: ExtensionFactSubject,
  operation: CheckedOperationMappingResult["operation"],
  evidence: readonly ExtensionEvidence[] = [],
): ExtensionFactWriteResult {
  const existing = context.facts.get(subject, targetOperationFactKey);
  if (targetOperationFactsAreStructurallyIdentical(existing, operation)) {
    return "idempotent";
  }
  return context.facts.set(subject, targetOperationFactKey, operation, evidence);
}

export function targetOperationFactsAreStructurallyIdentical(
  left: CheckedOperationMappingResult["operation"] | undefined,
  right: CheckedOperationMappingResult["operation"] | undefined,
): boolean {
  if (left === right) {
    return true;
  }
  if (left === undefined || right === undefined) {
    return false;
  }
  return left.operationId === right.operationId &&
    left.operationKind === right.operationKind &&
    left.targetOperation === right.targetOperation &&
    extensionFactSubjectTypeRefEquals(left.resultType, right.resultType);
}

export function sourceOwnedPropertyOperation(propertyName: string): CheckedOperationMappingResult["operation"] {
  return targetOperation(`${csharpSourceOwnedPropertyOperationPrefix}${propertyName}`, "property", propertyName);
}

export function targetOperationFromMember(member: TargetMember): CheckedOperationMappingResult["operation"] {
  return {
    operationId: member.id,
    operationKind: member.kind === "field" || member.kind === "event" ? "property" : member.kind,
    targetOperation: member.targetName,
  };
}

export function csharpTargetOperationFromMember(member: CsharpTargetMember): CsharpTargetMemberOperationFact {
  const resultType = member.kind === "constructor"
    ? member.declaringType
    : member.returnType;
  const argumentArrayLiteralElementTypes = getArgumentArrayLiteralElementTypes(member);
  return {
    kind: "member",
    operationId: member.id,
    operationKind: member.kind === "field" || member.kind === "event" ? "property" : member.kind,
    memberName: member.targetName,
    ...(member.static === true ? { static: true } : {}),
    ...(member.declaringType !== undefined ? { declaringType: member.declaringType } : {}),
    ...(resultType !== undefined ? { resultType } : {}),
    ...(argumentArrayLiteralElementTypes !== undefined ? { argumentArrayLiteralElementTypes } : {}),
    selectedMember: member,
  };
}

export function csharpTargetMemberOperation(
  operationId: string,
  operationKind: "property" | "method" | "indexer" | "constructor",
  memberName: string,
  options: {
    readonly static?: boolean;
    readonly declaringType?: TargetTypeRef;
    readonly sourceDeclaringType?: ExtensionFactSubject;
    readonly resultType?: TargetTypeRef;
    readonly argumentProjection?: readonly CsharpTargetOperationArgument[];
    readonly argumentArrayLiteralElementTypes?: readonly (TargetTypeRef | undefined)[];
    readonly selectedMember?: CsharpTargetMember;
  } = {},
): CsharpTargetMemberOperationFact {
  return {
    kind: "member",
    operationId,
    operationKind,
    memberName,
    ...(options.static === true ? { static: true } : {}),
    ...(options.declaringType !== undefined ? { declaringType: options.declaringType } : {}),
    ...(options.sourceDeclaringType !== undefined ? { sourceDeclaringType: options.sourceDeclaringType } : {}),
    ...(options.resultType !== undefined ? { resultType: options.resultType } : {}),
    ...(options.argumentProjection !== undefined ? { argumentProjection: options.argumentProjection } : {}),
    ...(options.argumentArrayLiteralElementTypes !== undefined ? { argumentArrayLiteralElementTypes: options.argumentArrayLiteralElementTypes } : {}),
    ...(options.selectedMember !== undefined ? { selectedMember: options.selectedMember } : {}),
  };
}

export function csharpTargetArrayCreationOperation(
  operationId: string,
  elementType: TargetTypeRef,
  selectedMember: CsharpTargetMember,
): CsharpTargetOperationFact {
  return {
    kind: "array-creation",
    operationId,
    elementType,
    resultType: { kind: "array", element: elementType },
    lengthArgumentIndex: 0,
    selectedMember,
  };
}

function getArgumentArrayLiteralElementTypes(member: CsharpTargetMember): readonly (TargetTypeRef | undefined)[] | undefined {
  const elementTypes = member.parameters.map((parameter) => getCsharpArrayLiteralElementTargetType(parameter.type));
  return elementTypes.some((elementType) => elementType !== undefined)
    ? elementTypes
    : undefined;
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

export function csharpTargetTokenOperatorOperation(
  operationId: string,
  operator: string,
  resultType?: TargetTypeRef,
): CsharpTargetOperationFact {
  return {
    kind: "operator-token",
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
  targetType: TargetTypeRef,
  negated: boolean,
  resultType?: TargetTypeRef,
): CsharpTargetOperationFact {
  return {
    kind: "typeof-comparison",
    operationId,
    runtimeKind,
    targetType,
    negated,
    ...(resultType !== undefined ? { resultType } : {}),
  };
}

export function csharpTargetCastOperation(
  operationId: string,
  targetType: TargetTypeRef,
): CsharpTargetOperationFact {
  return {
    kind: "cast",
    operationId,
    targetType,
    resultType: targetType,
  };
}

export function csharpTargetConversionOperatorOperation(
  operationId: string,
  conversionKind: CsharpTargetConversionOperatorOperationFact["conversionKind"],
  declaringType: TargetTypeRef,
  sourceType: TargetTypeRef,
  targetType: TargetTypeRef,
): CsharpTargetOperationFact {
  return {
    kind: "conversion-operator",
    operationId,
    conversionKind,
    declaringType,
    sourceType,
    targetType,
    resultType: targetType,
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

export function recordCsharpTargetMutationOperation(
  context: ExtensionObservationContext,
  subject: ExtensionFactSubject,
  operation: CsharpTargetOperationFact,
  evidence: readonly ExtensionEvidence[] = [],
): void {
  context.facts.set(subject, csharpTargetMutationOperationFactKey, operation, evidence);
}
