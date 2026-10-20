import type { Node, Type } from "@tsonic/tsts";
import { selectSourceGuardedValueMembers, selectSourceGuardedTypeMembers, selectSourceNativeGuardResult, selectSourceNativeValueGuard, type SourceNativeGuard, type SourceNativeValueGuard } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { csharpUnionLeaves } from "../../../target-model/types/union-relations.js";

import type { CsharpTypePolicyHost } from "./model.js";
import { getCsharpNullableElementTargetType } from "../../../target-model/types/carriers/nullable.js";
import { csharpAbsenceTargetType } from "../../../target-model/types/carriers/runtime-carriers.js";

import { selectCsharpNativeCarrierPredicate, type CsharpNativeFlowPredicate } from "../../../policy/operations/flow/native-predicates.js";
export function selectCsharpNativeFlowMembers(
  host: CsharpTypePolicyHost,
  reference: Node,
  sourceCarrier: TargetTypeRef,
  resolveNominal: (guard: Extract<SourceNativeValueGuard, { readonly kind: "nominal" }>) => TargetTypeRef | undefined,
): readonly TargetTypeRef[] | undefined {
  const present = getCsharpNullableElementTargetType(sourceCarrier) ?? sourceCarrier;
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
): boolean | undefined {
  return selectSourceNativeGuardResult(host, expression, reference => {
    const sourceCarrier = resolveCarrier(reference);
    if (sourceCarrier === undefined) return undefined;
    const present = getCsharpNullableElementTargetType(sourceCarrier) ?? sourceCarrier;
    const payloads = csharpUnionLeaves(present, host.typeDefinitions)?.map(member => member.carrier) ?? [present];
    return present === sourceCarrier ? payloads : [...payloads, csharpAbsenceTargetType()];
  }, selected => {
    const guard = selectSourceNativeValueGuard(host, selected);
    return guard?.kind === "typeof" || guard?.kind === "absence"
      ? { sourceOperand: guard.sourceOperand, predicate: guard } : undefined;
  },
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
