import type { Node, Type } from "@tsonic/tsts";
import { selectSourceGuardedValueMembers, selectSourceGuardedTypeMembers, selectSourceNativeGuardResult, selectSourceNativeValueGuard, type SourceNativeGuard, type SourceNativeValueGuard } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import { csharpUnionLeaves } from "../../../../target-model/types/union-relations.js";

import type { CsharpTypePolicyHost } from "./model.js";
import { csharpNullableTargetType, getCsharpNullableElementTargetType } from "../../../../target-model/types/carriers/nullable.js";
import { csharpAbsenceTargetType, isCsharpJsValueTargetType, csharpSourceUnionMembersMatch, csharpRuntimeUnionTargetType,
  isCsharpRuntimeUnionTargetType, isCsharpAbsenceTargetType } from "../../../../target-model/types/carriers/runtime-carriers.js";
import { targetTypeRefEquals } from "../../../../target-model/types/equality.js";
import type { CsharpTypeDefinitions } from "../../../../target-model/types/source-union-definitions.js";

import { selectCsharpNativeCarrierPredicate, type CsharpNativeFlowPredicate } from "../../../../policy/operations/flow/native-predicates.js";
export function selectCsharpNativeFlowCarrier(
  storage: TargetTypeRef, selected: TargetTypeRef | undefined,
  members: readonly TargetTypeRef[], definitions: CsharpTypeDefinitions | undefined,
): TargetTypeRef | undefined {
  if (members.length === 0) return undefined;
  const present = getCsharpNullableElementTargetType(storage) ?? storage;
  const leaves = csharpUnionLeaves(present, definitions)?.map(leaf => leaf.carrier) ?? [present];
  const available = present === storage ? leaves : [...leaves, csharpAbsenceTargetType()];
  let next = 0;
  for (const member of members) {
    const index = available.findIndex((candidate, position) => position >= next && targetTypeRefEquals(candidate, member));
    if (index < 0) return undefined;
    next = index + 1;
  }
  if (members.length === 1) return members[0];
  const matches = (candidate: TargetTypeRef): boolean => {
    const element = getCsharpNullableElementTargetType(candidate);
    const payload = element ?? candidate;
    if (!isCsharpRuntimeUnionTargetType(payload) || payload.csharpRuntimeUnionSemantics !== "native-ordered") {
      return csharpSourceUnionMembersMatch(candidate, members);
    }
    const ordered = element === undefined ? payload.csharpRuntimeUnionArms
      : [...payload.csharpRuntimeUnionArms, csharpAbsenceTargetType()];
    return ordered.length === members.length && ordered.every((member, index) => targetTypeRefEquals(member, members[index]!));
  };
  if (selected !== undefined && matches(selected)) return selected;
  const selectedPresent = getCsharpNullableElementTargetType(selected);
  if (selectedPresent !== undefined && matches(selectedPresent)) return selectedPresent;
  if (!isCsharpRuntimeUnionTargetType(present) || present.csharpRuntimeUnionSemantics !== "native-ordered") return undefined;
  const payloads = members.filter(member => !isCsharpAbsenceTargetType(member));
  const carrier = payloads.length === 1 ? payloads[0] : csharpRuntimeUnionTargetType(payloads);
  return carrier === undefined ? undefined : payloads.length === members.length ? carrier : csharpNullableTargetType(carrier);
}

export function selectCsharpNativeFlowMembers(
  host: CsharpTypePolicyHost,
  reference: Node,
  sourceCarrier: TargetTypeRef,
  resolveNominal: (guard: Extract<SourceNativeValueGuard, { readonly kind: "nominal" }>) => TargetTypeRef | undefined,
): readonly TargetTypeRef[] | undefined {
  const present = getCsharpNullableElementTargetType(sourceCarrier) ?? sourceCarrier;
  if (isCsharpJsValueTargetType(present)) return undefined;
  const payloads = csharpUnionLeaves(present, host.typeDefinitions)?.map(member => member.carrier) ??
    [present];
  const members = present === sourceCarrier ? payloads
    : [...payloads, csharpAbsenceTargetType()];
  return selectSourceGuardedValueMembers(host, reference, members,
    expression => selectNativeGuard(host, expression, resolveNominal),
    (member, predicate) => selectCsharpNativeCarrierPredicate(host.typeDefinitions, member, predicate));
}

export function selectCsharpNativeGuardResult(
  host: CsharpTypePolicyHost,
  expression: Node,
  resolveCarrier: (reference: Node) => TargetTypeRef | undefined,
  resolveNominal: (guard: Extract<SourceNativeValueGuard, { readonly kind: "nominal" }>) => TargetTypeRef | undefined,
): boolean | undefined {
  return selectSourceNativeGuardResult(host, expression, reference => {
    const sourceCarrier = resolveCarrier(reference);
    if (sourceCarrier === undefined) return undefined;
    const present = getCsharpNullableElementTargetType(sourceCarrier) ?? sourceCarrier;
    const payloads = csharpUnionLeaves(present, host.typeDefinitions)?.map(member => member.carrier) ?? [present];
    return present === sourceCarrier ? payloads : [...payloads, csharpAbsenceTargetType()];
  }, selected => selectNativeGuard(host, selected, resolveNominal),
    (member, predicate) => selectCsharpNativeCarrierPredicate(host.typeDefinitions, member, predicate));
}

export function selectCsharpNativeFlowTypeMembers(
  host: CsharpTypePolicyHost,
  reference: Node,
  sourceType: Type,
  resolveCarrier: (type: Type) => TargetTypeRef | undefined,
  resolveNominal: (guard: Extract<SourceNativeValueGuard, { readonly kind: "nominal" }>) => TargetTypeRef | undefined,
): readonly Type[] | undefined {
  return selectSourceGuardedTypeMembers(host, reference, sourceType,
    expression => selectNativeGuard(host, expression, resolveNominal),
    (type, predicate) => {
      const carrier = resolveCarrier(type);
      return carrier === undefined ? undefined : selectCsharpNativeCarrierPredicate(host.typeDefinitions, carrier, predicate);
    });
}

function selectNativeGuard(
  host: CsharpTypePolicyHost,
  expression: Node,
  resolveNominal: (guard: Extract<SourceNativeValueGuard, { readonly kind: "nominal" }>) => TargetTypeRef | undefined,
): SourceNativeGuard<CsharpNativeFlowPredicate> | undefined {
  const native = selectSourceNativeValueGuard(host, expression);
  if (native?.kind === "absence") return { sourceOperand: native.sourceOperand, predicate: native };
  if (native?.kind === "typeof") return { sourceOperand: native.sourceOperand, predicate: native };
  if (native?.kind === "literal") return { sourceOperand: native.sourceOperand, predicate: native };
  if (native?.kind === "nominal") {
    const targetCarrier = resolveNominal(native);
    if (targetCarrier !== undefined) return { sourceOperand: native.sourceOperand, predicate: { kind: "nominal", targetCarrier } };
  }
  return host.closedTypeGuard(expression);
}
